import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ExecutionContext, ToolDefinition } from '../types'
import { getGoogleAccountMetrics, defaultGoogleDateRange, normalizeCustomerId } from '@/lib/google-ads/service'
import { defaultMetaDateRange, getMetaAccountMetrics, getMetaErrorDetails, normalizeMetaAccountId } from '@/lib/meta-ads/service'
import { upsertPaidMediaSnapshot } from '@/lib/ai/contracts/performance-analyst'
import { runPerformanceAnalyst } from '@/lib/ai/specialists/performance-analyst'

const noInput = z.object({})

function addGoogleSnapshot(context: ExecutionContext, account: { id_cuenta: string; nombre_cuenta: string | null; moneda: string | null }, metrics: Awaited<ReturnType<typeof getGoogleAccountMetrics>>) {
  if (!context.analysisRunState || !context.clientId) return
  upsertPaidMediaSnapshot(context.analysisRunState, {
    client_id: context.clientId,
    platform: 'google',
    account_id: metrics.account_id,
    account_name: metrics.account_name ?? account.nombre_cuenta,
    currency: account.moneda,
    period: { from: metrics.date_range.start, to: metrics.date_range.end },
    metrics: metrics.totals,
    conversion_actions: metrics.conversion_actions.map((action) => ({ ...action })),
    conversion_actions_available: metrics.conversion_actions_available,
    conversion_actions_error: metrics.conversion_actions_error,
    campaigns: metrics.campaigns,
  })
}

function addMetaSnapshot(context: ExecutionContext, account: { id_cuenta: string; nombre_cuenta: string | null; moneda: string | null }, metrics: Awaited<ReturnType<typeof getMetaAccountMetrics>>) {
  if (!context.analysisRunState || !context.clientId) return
  upsertPaidMediaSnapshot(context.analysisRunState, {
    client_id: context.clientId,
    platform: 'meta',
    account_id: metrics.account_id,
    account_name: metrics.account_name ?? account.nombre_cuenta,
    currency: metrics.moneda ?? account.moneda,
    period: { from: metrics.date_range.start, to: metrics.date_range.end },
    metrics: { ...metrics.totals, results_by_type: metrics.results_by_type },
    conversion_actions: [],
    conversion_actions_available: false,
    conversion_actions_error: null,
    campaigns: metrics.campaigns.map((campaign) => ({ ...campaign })),
  })
}

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
          const metrics = await getMetaAccountMetrics({ accountId: account.id_cuenta, accountName: account.nombre_cuenta, moneda: account.moneda, zonaHoraria: account.zona_horaria, dateFrom: dateFrom!, dateTo: dateTo!, onlyActiveCampaigns: false })
          addMetaSnapshot(context, account, metrics)
          return { account, metrics }
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
  description: 'Consulta métricas reales de Google Ads de las cuentas activas del cliente seleccionado. Cada cuenta incluye conversion_actions con el nombre exacto de la acción de conversión, conversiones, valor y campañas relacionadas; totals.leads es únicamente el total agregado.',
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
        try {
          const metrics = await getGoogleAccountMetrics({ customerId: account.id_cuenta, accountName: account.nombre_cuenta, dateFrom: dateFrom!, dateTo: dateTo! })
          addGoogleSnapshot(context, account, metrics)
          return { account, metrics }
        }
        catch (cause) { return { account, error: cause instanceof Error ? cause.message : 'No se pudo consultar esta cuenta.' } }
      }))
      results.push(...batchResults)
    }
    const successful = results.filter((result) => result.metrics)
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_metrics', status: 'completed', label: successful.length === selected.length ? 'Métricas de Google Ads recibidas' : `Se consultaron ${successful.length} de ${selected.length} cuentas de Google Ads` })
    return { available: true, partial: successful.length !== selected.length, date_range: { start: dateFrom, end: dateTo }, accounts: successful.map((result) => result.metrics), errors: results.filter((result) => result.error).map((result) => ({ account_id: result.account.id_cuenta, account_name: result.account.nombre_cuenta, message: result.error })) }
  },
}

const runPerformanceAnalystTool: ToolDefinition = {
  key: 'run_performance_analyst',
  description: 'Analiza los snapshots de Google Ads y Meta Ads recolectados durante este request.',
  inputSchema: noInput,
  async execute(_input, context: ExecutionContext) {
    const state = context.analysisRunState
    if (!state?.paidMediaSnapshots.length) {
      return { available: false, code: 'NO_DATA_AVAILABLE_FOR_ANALYSIS', message: 'Primero deben consultarse métricas de Google Ads o Meta Ads.' }
    }
    if (!context.clientId) {
      return { available: false, code: 'INVALID_ANALYSIS_ENTITY', message: 'No hay un cliente activo para validar el análisis.' }
    }
    const allSnapshots = structuredClone(state.paidMediaSnapshots)
    const latestPeriod = [...new Set(allSnapshots.map((snapshot) => `${snapshot.period.from}:${snapshot.period.to}`))].sort().at(-1)
    const snapshots = latestPeriod
      ? allSnapshots.filter((snapshot) => `${snapshot.period.from}:${snapshot.period.to}` === latestPeriod)
      : allSnapshots
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const snapshotClientIds = [...new Set(snapshots.map((snapshot) => snapshot.client_id))]
    const platforms = [...new Set(snapshots.map((snapshot) => snapshot.platform))]
    const periods = [...new Set(snapshots.map((snapshot) => `${snapshot.period.from}:${snapshot.period.to}`))]
    const validation = {
      context_client_id_present: Boolean(context.clientId),
      snapshot_count: snapshots.length,
      snapshot_client_ids_unique: snapshotClientIds.length,
      client_matches: snapshots.every((snapshot) => snapshot.client_id === context.clientId),
      platforms,
      platform_valid: snapshots.every((snapshot) => snapshot.platform === 'google' || snapshot.platform === 'meta'),
      periods_unique: periods.length,
      account_ids: snapshots.filter((snapshot) => Boolean(snapshot.account_id)).length,
      account_ids_present: snapshots.every((snapshot) => Boolean(snapshot.account_id)),
      period_from_present: snapshots.every((snapshot) => Boolean(snapshot.period?.from)),
      period_to_present: snapshots.every((snapshot) => Boolean(snapshot.period?.to)),
      period_format_valid: snapshots.every((snapshot) => datePattern.test(snapshot.period.from) && datePattern.test(snapshot.period.to)),
      period_order_valid: snapshots.every((snapshot) => snapshot.period.from <= snapshot.period.to),
    }
    console.log('[v0] analysis entity validation', { ...validation, valid: validation.context_client_id_present && validation.client_matches && validation.platform_valid && validation.account_ids_present && validation.period_from_present && validation.period_to_present && validation.period_format_valid && validation.period_order_valid && validation.periods_unique === 1 })
    const valid = validation.context_client_id_present && validation.client_matches && validation.platform_valid && validation.account_ids_present && validation.period_from_present && validation.period_to_present && validation.period_format_valid && validation.period_order_valid && validation.periods_unique === 1
    if (!valid) {
      return { available: false, code: validation.periods_unique > 1 ? 'INCOMPATIBLE_ANALYSIS_PERIODS' : 'INVALID_ANALYSIS_ENTITY', message: validation.periods_unique > 1 ? 'No se pueden mezclar períodos distintos en un mismo análisis.' : 'Los datos de análisis no pertenecen al cliente o tienen una entidad inválida.' }
    }

    context.emitActivity?.({ agentSlug: 'performance-analyst', toolKey: 'run_performance_analyst', status: 'running', label: 'Analizando performance...' })
    try {
      const output = await runPerformanceAnalyst({ context, snapshots, model: 'openai/gpt-4.1-mini-fast' })
      const expectedAccountIds = new Set(snapshots.map((snapshot) => snapshot.account_id))
      const outputAccountIds = new Set(output.entidad.account_ids)
      const expectedPeriod = snapshots[0].period
      const expectedPlatform = platforms.length === 1 ? platforms[0] : 'mixed'
      const entityMatches = output.entidad.client_id === context.clientId &&
        output.entidad.platform === expectedPlatform &&
        output.entidad.account_ids.every((accountId) => expectedAccountIds.has(accountId)) &&
        outputAccountIds.size === expectedAccountIds.size &&
        output.entidad.period.from === expectedPeriod.from &&
        output.entidad.period.to === expectedPeriod.to
      if (!entityMatches) {
        console.log('[v0] performance analyst output entity validation', { client_matches: output.entidad.client_id === context.clientId, platform_matches: output.entidad.platform === expectedPlatform, account_ids_subset: [...outputAccountIds].every((accountId) => expectedAccountIds.has(accountId)), account_ids_complete: outputAccountIds.size === expectedAccountIds.size, period_matches: output.entidad.period.from === expectedPeriod.from && output.entidad.period.to === expectedPeriod.to })
        output.entidad = {
          ...output.entidad,
          client_id: context.clientId,
          platform: expectedPlatform as 'google' | 'meta' | 'mixed',
          account_ids: [...expectedAccountIds],
          period: expectedPeriod,
        }
      }
      context.emitActivity?.({ agentSlug: 'performance-analyst', toolKey: 'run_performance_analyst', status: 'completed', label: 'Analista de Performance completó el análisis' })
      return output
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo validar la salida del Performance Analyst.'
      context.emitActivity?.({ agentSlug: 'performance-analyst', toolKey: 'run_performance_analyst', status: 'error', label: message })
      return { available: false, code: 'SPECIALIST_OUTPUT_INVALID', message }
    }
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
  runPerformanceAnalystTool,
  getPreviousInsights,
]

export function getToolDefinitions(enabledKeys: string[]): ToolDefinition[] {
  return allTools.filter((definition) => enabledKeys.includes(definition.key))
}

export function getToolCatalog() {
  return allTools.map(({ key, description }) => ({ key, description }))
}
