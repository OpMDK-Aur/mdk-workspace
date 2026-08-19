import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ExecutionContext, ToolDefinition } from '../types'
import { getGoogleAccountMetrics, defaultGoogleDateRange, normalizeCustomerId } from '@/lib/google-ads/service'
import { defaultMetaDateRange, getMetaAccountMetrics, getMetaErrorDetails, normalizeMetaAccountId } from '@/lib/meta-ads/service'

const noInput = z.object({})

const getAccountContext: ToolDefinition = {
  key: 'get_account_context',
  description: 'Obtiene el cliente activo y sus cuentas publicitarias activas desde Supabase.',
  inputSchema: noInput,
  async execute(_input, context: ExecutionContext) {
    const emit = context.emitActivity
    const clientLabel = context.metadata?.clientName
    emit?.({ agentSlug: 'supervisor', toolKey: 'get_account_context', status: 'running', label: `Cargando contexto${clientLabel ? ` de ${clientLabel}` : ''}...` })
    if (!context.clientId) {
      console.warn('[v0] get_account_context skipped: missing client_id')
      return { available: false, message: 'No hay un cliente activo seleccionado.' }
    }

    const supabase = await createClient()
    const { data: client, error: clientError } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio')
      .eq('id', context.clientId)
      .single()

    if (clientError || !client) {
      console.error('[v0] get_account_context client lookup failed:', clientError?.message ?? 'Client not found')
      return { available: false, client_id: context.clientId, message: 'No se encontró el cliente seleccionado.' }
    }

    const { data: accounts, error: accountsError } = await supabase
      .from('cuentas_publicitarias')
      .select('plataforma, id_cuenta, nombre_cuenta, moneda, zona_horaria')
      .eq('cliente_id', context.clientId)
      .eq('activo', true)

    if (accountsError) {
      console.error('[v0] get_account_context accounts lookup failed:', accountsError.message)
      return { available: false, client_id: context.clientId, message: 'No se pudieron consultar las cuentas publicitarias.' }
    }

    const safeAccounts = (accounts ?? []).map((account) => ({
      plataforma: account.plataforma,
      id_cuenta: account.id_cuenta,
      ...(account.nombre_cuenta ? { nombre_cuenta: account.nombre_cuenta } : {}),
      ...(account.moneda ? { moneda: account.moneda } : {}),
      ...(account.zona_horaria ? { zona_horaria: account.zona_horaria } : {}),
    }))

    const google = safeAccounts.find((account) => account.plataforma?.toLowerCase() === 'google')
    const meta = safeAccounts.find((account) => account.plataforma?.toLowerCase() === 'meta')

    console.log('[v0] get_account_context executed', {
      client_id: client.id,
      active_accounts_count: safeAccounts.length,
      platforms: safeAccounts.map((account) => account.plataforma),
    })
    emit?.({ agentSlug: 'supervisor', toolKey: 'get_account_context', status: 'completed', label: `${safeAccounts.length} cuentas publicitarias encontradas` })

    return {
      available: true,
      client_id: client.id,
      nombre_del_negocio: client.nombre_del_negocio,
      cuentas_publicitarias: safeAccounts,
      ...(google?.id_cuenta ? { google_ads_customer_id: google.id_cuenta } : {}),
      ...(meta?.id_cuenta ? { meta_ads_account_id: meta.id_cuenta } : {}),
    }
  },
}

const getMetaMetrics: ToolDefinition = {
  key: 'get_meta_metrics',
  description: 'Consulta métricas reales de Meta Ads de las cuentas activas del cliente seleccionado.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), accountId: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string; accountId?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    if ((input.dateFrom && !input.dateTo) || (!input.dateFrom && input.dateTo)) return { available: false, message: 'Debes indicar dateFrom y dateTo juntos.' }

    const { dateFrom, dateTo } = input.dateFrom && input.dateTo ? input : defaultMetaDateRange()
    const supabase = await createClient()
    const { data: accounts, error } = await supabase
      .from('cuentas_publicitarias')
      .select('id_cuenta, nombre_cuenta, moneda, zona_horaria')
      .eq('cliente_id', context.clientId)
      .eq('plataforma', 'meta')
      .eq('activo', true)
    if (error) return { available: false, message: 'No se pudieron consultar las cuentas activas de Meta Ads.' }

    const availableAccounts = accounts ?? []
    const selected = input.accountId
      ? availableAccounts.filter((account) => normalizeMetaAccountId(account.id_cuenta) === normalizeMetaAccountId(input.accountId!))
      : availableAccounts
    if (input.accountId && selected.length === 0) return { available: false, message: 'La cuenta solicitada no pertenece al cliente seleccionado.' }
    if (!selected.length) return { available: false, message: 'El cliente no tiene cuentas activas de Meta Ads.' }

    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_meta_metrics', status: 'running', label: 'Consultando Meta Ads...' })
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_meta_metrics', status: 'running', label: `Consultando ${selected.length} cuenta${selected.length === 1 ? '' : 's'} de Meta Ads...` })

    const results: Array<{ account: typeof selected[number]; metrics?: Awaited<ReturnType<typeof getMetaAccountMetrics>>; error?: ReturnType<typeof getMetaErrorDetails> }> = []
    for (let index = 0; index < selected.length; index += 3) {
      const batch = selected.slice(index, index + 3)
      const batchResults = await Promise.all(batch.map(async (account) => {
        try {
          return { account, metrics: await getMetaAccountMetrics({ accountId: account.id_cuenta, accountName: account.nombre_cuenta, moneda: account.moneda, zonaHoraria: account.zona_horaria, dateFrom: dateFrom!, dateTo: dateTo!, onlyActiveCampaigns: false }) }
        } catch (cause) {
          return { account, error: getMetaErrorDetails(cause) }
        }
      }))
      results.push(...batchResults)
    }

    const successful = results.filter((result) => result.metrics)
    const errors = results.filter((result) => result.error).map((result) => ({ account_id: result.account.id_cuenta, account_name: result.account.nombre_cuenta, ...result.error }))
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_meta_metrics', status: 'completed', label: successful.length === selected.length ? 'Métricas de Meta Ads recibidas' : `Se consultaron ${successful.length} de ${selected.length} cuentas de Meta Ads` })

    const totalsByCurrency: Record<string, { spend: number; accounts: number }> = {}
    for (const result of successful) {
      const currency = result.metrics!.moneda || 'UNKNOWN'
      const current = totalsByCurrency[currency] ?? { spend: 0, accounts: 0 }
      current.spend += result.metrics!.totals.spend
      current.accounts += 1
      totalsByCurrency[currency] = current
    }
    return {
      available: true,
      platform: 'meta',
      date_range: { start: dateFrom, end: dateTo },
      requested_accounts: selected.length,
      successful_accounts: successful.length,
      failed_accounts: errors.length,
      partial: errors.length > 0,
      accounts: successful.map((result) => result.metrics),
      totals_by_currency: totalsByCurrency,
      errors,
    }
  },
}

const getGoogleMetrics: ToolDefinition = {
  key: 'get_google_metrics',
  description: 'Consulta métricas reales de Google Ads de las cuentas activas del cliente seleccionado.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), accountId: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string; accountId?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    if ((input.dateFrom && !input.dateTo) || (!input.dateFrom && input.dateTo)) return { available: false, message: 'Debes indicar dateFrom y dateTo juntos.' }
    const { dateFrom, dateTo } = input.dateFrom && input.dateTo ? input : defaultGoogleDateRange()
    const supabase = await createClient()
    const { data: accounts, error } = await supabase.from('cuentas_publicitarias').select('id_cuenta, nombre_cuenta, moneda, zona_horaria').eq('cliente_id', context.clientId).eq('plataforma', 'google').eq('activo', true)
    if (error) return { available: false, message: 'No se pudieron consultar las cuentas activas de Google Ads.' }
    const availableAccounts = accounts ?? []
    const selected = input.accountId ? availableAccounts.filter((account) => normalizeCustomerId(account.id_cuenta) === normalizeCustomerId(input.accountId!)) : availableAccounts
    if (input.accountId && selected.length === 0) return { available: false, message: 'La cuenta solicitada no pertenece al cliente seleccionado.' }
    if (!selected.length) return { available: false, message: 'El cliente no tiene cuentas activas de Google Ads.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_metrics', status: 'running', label: 'Consultando Google Ads...' })
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_metrics', status: 'running', label: `Consultando ${selected.length} cuenta${selected.length === 1 ? '' : 's'} de Google Ads...` })
    const results: Array<{ account: typeof selected[number]; metrics?: Awaited<ReturnType<typeof getGoogleAccountMetrics>>; error?: string }> = []
    for (let index = 0; index < selected.length; index += 3) {
      const batch = selected.slice(index, index + 3)
      const batchResults = await Promise.all(batch.map(async (account) => {
        try { return { account, metrics: await getGoogleAccountMetrics({ customerId: account.id_cuenta, accountName: account.nombre_cuenta, dateFrom: dateFrom!, dateTo: dateTo! }) } }
        catch (cause) { return { account, error: cause instanceof Error ? cause.message : 'No se pudo consultar esta cuenta.' } }
      }))
      results.push(...batchResults)
    }
    const successful = results.filter((result) => result.metrics)
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_metrics', status: 'completed', label: successful.length === selected.length ? 'Métricas de Google Ads recibidas' : `Se consultaron ${successful.length} de ${selected.length} cuentas de Google Ads` })
    return { available: true, partial: successful.length !== selected.length, date_range: { start: dateFrom, end: dateTo }, accounts: successful.map((result) => result.metrics), errors: results.filter((result) => result.error).map((result) => ({ account_id: result.account.id_cuenta, account_name: result.account.nombre_cuenta, message: result.error })) }
  },
}

const getPreviousInsights: ToolDefinition = {
  key: 'get_previous_insights',
  description: 'Busca hallazgos previos de una cuenta.',
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
  async execute(input: { limit: number }, context: ExecutionContext) {
    return {
      available: false,
      limit: input.limit,
      accountId: context.accountId ?? null,
      message: 'La memoria de insights se habilitará cuando se confirme el esquema de Supabase.',
    }
  },
}

const allTools: ToolDefinition[] = [
  getAccountContext,
  getMetaMetrics,
  getGoogleMetrics,
  getPreviousInsights,
]

export function getToolDefinitions(enabledKeys: string[]): ToolDefinition[] {
  return allTools.filter((definition) => enabledKeys.includes(definition.key))
}

export function getToolCatalog() {
  return allTools.map(({ key, description }) => ({ key, description }))
}
