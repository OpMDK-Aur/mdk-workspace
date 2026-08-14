import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ExecutionContext, ToolDefinition } from '../types'

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
  description: 'Consulta métricas de Meta Ads con contexto de cuenta server-side.',
  inputSchema: z.object({ period: z.string().max(80).optional() }),
  async execute(input: { period?: string }, context: ExecutionContext) {
    return {
      available: false,
      period: input.period ?? 'últimos 30 días',
      metaAccountId: context.metaAccountId ?? null,
      message: 'La integración de métricas de Meta Ads está reservada para la siguiente etapa.',
    }
  },
}

const getGoogleMetrics: ToolDefinition = {
  key: 'get_google_metrics',
  description: 'Consulta métricas de Google Ads con contexto de cuenta server-side.',
  inputSchema: z.object({ period: z.string().max(80).optional() }),
  async execute(input: { period?: string }, context: ExecutionContext) {
    return {
      available: false,
      period: input.period ?? 'últimos 30 días',
      googleCustomerId: context.googleCustomerId ?? null,
      message: 'La integración de métricas de Google Ads está reservada para la siguiente etapa.',
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
  getPreviousInsights,
]

export function getToolDefinitions(enabledKeys: string[]): ToolDefinition[] {
  return allTools.filter((definition) => enabledKeys.includes(definition.key))
}

export function getToolCatalog() {
  return allTools.map(({ key, description }) => ({ key, description }))
}
