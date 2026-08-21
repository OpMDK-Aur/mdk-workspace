import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ExecutionContext, ToolDefinition } from '../types'
import { getGoogleAccountChangeHistory, getGoogleAccountMetrics, defaultGoogleDateRange, normalizeCustomerId, splitCustomerIds } from '@/lib/google-ads/service'
import { defaultMetaDateRange, getMetaAccountMetrics, getMetaErrorDetails, normalizeMetaAccountId } from '@/lib/meta-ads/service'
import { buildCampaignComparisons, compareMetric, upsertChangeHistory, upsertPaidMediaSnapshot } from '@/lib/ai/contracts/performance-analyst'
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
    change_history: [],
    change_history_available: false,
    change_history_error: null,
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
    change_history: [],
    change_history_available: false,
    change_history_error: null,
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

    const safeAccounts = (accounts ?? []).flatMap((account) => String(account.id_cuenta ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({
        plataforma: account.plataforma,
        id_cuenta: id,
        ...(account.nombre_cuenta ? { nombre_cuenta: account.nombre_cuenta } : {}),
        ...(account.moneda ? { moneda: account.moneda } : {}),
        ...(account.zona_horaria ? { zona_horaria: account.zona_horaria } : {}),
      })))

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

    const availableAccounts = (accounts ?? []).flatMap((account) => splitCustomerIds(account.id_cuenta).map((id_cuenta) => ({ ...account, id_cuenta })))
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
    const availableAccounts = (accounts ?? []).flatMap((account) => splitCustomerIds(account.id_cuenta).map((id_cuenta) => ({ ...account, id_cuenta })))
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

const getAccountChangeHistory: ToolDefinition = {
  key: 'get_account_change_history',
  description: 'Consulta el historial real de cambios de Google Ads para responder quién cambió qué y cuándo. No reemplaza las métricas.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), accountId: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string; accountId?: string }, context: ExecutionContext) {
    if ((input.dateFrom && !input.dateTo) || (!input.dateFrom && input.dateTo)) return { available: false, message: 'Debes indicar dateFrom y dateTo juntos.' }
    const range = input.dateFrom && input.dateTo ? { dateFrom: input.dateFrom, dateTo: input.dateTo } : defaultGoogleDateRange()
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const supabase = await createClient()
    const { data: accounts, error } = await supabase.from('cuentas_publicitarias').select('id_cuenta, nombre_cuenta').eq('cliente_id', context.clientId).eq('plataforma', 'google').eq('activo', true)
    if (error) return { available: false, message: 'No se pudieron consultar las cuentas activas de Google Ads.' }
    const availableAccounts = (accounts ?? []).flatMap((account) => splitCustomerIds(account.id_cuenta).map((id_cuenta) => ({ ...account, id_cuenta })))
    const selected = input.accountId ? availableAccounts.filter((account) => normalizeCustomerId(account.id_cuenta) === normalizeCustomerId(input.accountId!)) : availableAccounts
    if (!selected.length) return { available: false, message: input.accountId ? 'La cuenta solicitada no pertenece al cliente seleccionado.' : 'El cliente no tiene cuentas activas de Google Ads.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_account_change_history', status: 'running', label: `Consultando historial de ${selected.length} cuenta${selected.length === 1 ? '' : 's'} de Google Ads...` })
    const results: Array<{ account: typeof selected[number]; history?: Awaited<ReturnType<typeof getGoogleAccountChangeHistory>>; error?: string }> = []
    for (let index = 0; index < selected.length; index += 3) {
      const batch = selected.slice(index, index + 3)
      results.push(...await Promise.all(batch.map(async (account) => { try { return { account, history: await getGoogleAccountChangeHistory({ customerId: account.id_cuenta, accountName: account.nombre_cuenta, ...range }) } } catch (cause) { return { account, error: cause instanceof Error ? cause.message : 'No se pudo consultar esta cuenta.' } } })))
    }
    const events = results.flatMap(({ history }) => history?.events ?? [])
    if (events.length) {
      const rows = events.map((event) => ({
        client_id: context.clientId,
        advertising_account_id: event.account_id,
        platform: event.platform,
        account_id: event.account_id,
        account_name: selected.find((account) => normalizeCustomerId(account.id_cuenta) === normalizeCustomerId(event.account_id))?.nombre_cuenta ?? null,
        source_event_id: `${event.account_id}:${event.occurred_at}:${event.metadata.resource_name ?? ''}:${event.operation}`,
        occurred_at: event.occurred_at,
        actor_id: event.actor.id,
        actor_name: event.actor.name,
        actor_email: event.actor.email,
        client_type: event.metadata.client_type,
        entity_type: event.entity.type,
        entity_id: event.entity.id,
        entity_name: event.entity.name,
        operation: event.operation,
        changed_fields: event.changed_fields,
        field_categories: [...new Set(event.changed_fields.map((field) => field.field_category))],
        source: event.source,
        raw_metadata: event.metadata,
      }))
      const { error: persistError } = await supabase.from('paid_media_change_events').insert(rows)
      if (persistError) context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_account_change_history', status: 'error', label: 'No se pudo persistir el historial de cambios' })
    }
    if (context.analysisRunState) upsertChangeHistory(context.analysisRunState, events)
    const errors = results.filter((result) => result.error || result.history?.error).map((result) => ({ account_id: result.account.id_cuenta, account_name: result.account.nombre_cuenta, message: result.error ?? result.history?.error, limitation: result.history?.limitation }))
    const completedLabel = errors.length ? `Se consultó el historial de ${results.length - errors.length} de ${results.length} cuentas` : 'Historial de cambios recibido'
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_account_change_history', status: 'completed', label: completedLabel })
    return { available: true, date_range: range, events, errors, history_available: results.some((result) => result.history?.available), history_complete: results.every((result) => result.history?.history_complete), limitations: results.map((result) => result.history?.limitation).filter(Boolean) }
  },
}

const getGoogleChangeHistoryTool: ToolDefinition = { ...getAccountChangeHistory, key: 'get_google_change_history', description: getAccountChangeHistory.description }

const runPerformanceAnalystTool: ToolDefinition = {
  key: 'run_performance_analyst',
  description: 'Analiza los snapshots de Google Ads y Meta Ads recolectados durante este request.',
  inputSchema: noInput,
  async execute(_input, context: ExecutionContext) {
    const state = context.analysisRunState
    if (!state?.currentSnapshots.length) {
      return { available: false, code: 'NO_DATA_AVAILABLE_FOR_ANALYSIS', message: 'Primero deben consultarse métricas de Google Ads o Meta Ads.' }
    }
    if (!context.clientId) {
      return { available: false, code: 'INVALID_ANALYSIS_ENTITY', message: 'No hay un cliente activo para validar el análisis.' }
    }
    const currentSnapshots = structuredClone(state.currentSnapshots)
    const comparisonSnapshots = structuredClone(state.comparisonSnapshots)
    const snapshots = [...currentSnapshots, ...comparisonSnapshots]
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const platforms = [...new Set(snapshots.map((snapshot) => snapshot.platform))]
    const validation = {
      snapshot_count: snapshots.length,
      current_count: currentSnapshots.length,
      comparison_count: comparisonSnapshots.length,
      client_matches: snapshots.every((snapshot) => snapshot.client_id === context.clientId),
      platform_valid: snapshots.every((snapshot) => snapshot.platform === 'google' || snapshot.platform === 'meta'),
      periods_valid: snapshots.every((snapshot) => datePattern.test(snapshot.period.from) && datePattern.test(snapshot.period.to) && snapshot.period.from <= snapshot.period.to),
      currencies_by_account: [...new Set(snapshots.filter((snapshot) => snapshot.currency).map((snapshot) => `${snapshot.account_id}:${snapshot.currency}`))].length === new Set(snapshots.map((snapshot) => snapshot.account_id)).size,
      periods_non_overlapping: !state.comparisonDefinition || state.comparisonDefinition.current.to < state.comparisonDefinition.comparison.from || state.comparisonDefinition.comparison.to < state.comparisonDefinition.current.from,
    }
    const comparable = state.comparisonDefinition && comparisonSnapshots.length > 0
    const metricComparisons = comparable ? currentSnapshots.map((current) => {
      const previous = comparisonSnapshots.find((snapshot) => snapshot.platform === current.platform && snapshot.account_id === current.account_id)
      return { platform: current.platform, account_id: current.account_id, metrics: previous ? Object.fromEntries(Object.keys(current.metrics).map((key) => [key, compareMetric(current.metrics[key], previous.metrics[key])]).filter(([, value]) => value)) : null }
    }) : []
    const campaignComparisons = comparable ? buildCampaignComparisons(currentSnapshots, comparisonSnapshots) : []
    const valid = validation.client_matches && validation.platform_valid && validation.periods_valid && validation.currencies_by_account && validation.periods_non_overlapping
    console.log('[v0] analysis comparison validation', { ...validation, valid, comparable })
    if (!valid) {
      return { available: false, code: 'INVALID_ANALYSIS_ENTITY', message: 'Los datos de análisis no son comparables o tienen una entidad inválida.' }
    }

    context.emitActivity?.({ agentSlug: 'performance-analyst', toolKey: 'run_performance_analyst', status: 'running', label: 'Analizando performance...' })
    try {
      const output = await runPerformanceAnalyst({ context, snapshots: currentSnapshots, comparisonSnapshots, changeHistory: state.changeHistory, model: 'openai/gpt-4.1-mini-fast' })
      const expectedAccountIds = new Set(currentSnapshots.map((snapshot) => snapshot.account_id))
      const outputAccountIds = new Set(output.entidad.account_ids)
      const expectedPeriod = currentSnapshots[0].period
      const expectedPlatform = [...new Set(currentSnapshots.map((snapshot) => snapshot.platform))].length === 1 ? currentSnapshots[0].platform : 'mixed'
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
  getAccountChangeHistory,
  getGoogleChangeHistoryTool,
  runPerformanceAnalystTool,
  getPreviousInsights,
]

export function getToolDefinitions(enabledKeys: string[]): ToolDefinition[] {
  return allTools.filter((definition) => enabledKeys.includes(definition.key))
}

export function getToolCatalog() {
  return allTools.map(({ key, description }) => ({ key, description }))
}
