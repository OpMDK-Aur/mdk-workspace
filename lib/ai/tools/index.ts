import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ExecutionContext, ToolDefinition } from '../types'
import { getGoogleAccountMetrics, defaultGoogleDateRange, normalizeCustomerId, splitCustomerIds } from '@/lib/google-ads/service'
import { defaultMetaDateRange, getMetaAccountMetrics, getMetaErrorDetails, normalizeMetaAccountId } from '@/lib/meta-ads/service'
import { buildCampaignComparisons, compareMetric, upsertChangeHistory, upsertPaidMediaSnapshot, SpecialistOutputSchema, type IndustryBenchmark } from '@/lib/ai/contracts/performance-analyst'
import { runPerformanceAnalyst } from '@/lib/ai/specialists/performance-analyst'
import { contextFromEvents, mergeWorkingContext } from '@/lib/ai/conversation-context'
import { buildClientMemory, buildPerformance90d, emptyClientMemory, normalizeIndustry, type MetricRow } from '@/lib/ai/client-memory'

const noInput = z.object({})

/**
 * Convierte el string (potencialmente separado por comas) de cuenta(s)
 * seleccionada(s) en la UI en un set de ids normalizados. Devuelve null
 * cuando no hay selección explícita, para no restringir nada en ese caso.
 */
function parseSelectedAccountIds(value: string | undefined, normalize: (id: string) => string): Set<string> | null {
  if (!value) return null
  const ids = value
    .split(',')
    .map((id) => normalize(id.trim()))
    .filter(Boolean)
  return ids.length > 0 ? new Set(ids) : null
}

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

    const allAccounts = (accounts ?? []).flatMap((account) => String(account.id_cuenta ?? '')
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

    // Si el usuario eligió cuenta(s) específicas en la UI, el agente sólo
    // debe ver (y por lo tanto analizar) esas cuentas, no todas las activas
    // del cliente.
    const metaSelection = parseSelectedAccountIds(context.metaAccountId, normalizeMetaAccountId)
    const googleSelection = parseSelectedAccountIds(context.googleCustomerId, normalizeCustomerId)
    const safeAccounts = allAccounts.filter((account) => {
      const platform = account.plataforma?.toLowerCase()
      if (platform === 'meta' && metaSelection) return metaSelection.has(normalizeMetaAccountId(account.id_cuenta))
      if (platform === 'google' && googleSelection) return googleSelection.has(normalizeCustomerId(account.id_cuenta))
      return true
    })

    const google = safeAccounts.find((account) => account.plataforma?.toLowerCase() === 'google')
    const meta = safeAccounts.find((account) => account.plataforma?.toLowerCase() === 'meta')

    console.log('[v0] get_account_context executed', {
      client_id: client.id,
      active_accounts_count: safeAccounts.length,
      total_active_accounts_count: allAccounts.length,
      platforms: safeAccounts.map((account) => account.plataforma),
      restricted_by_selection: Boolean(metaSelection || googleSelection),
    })
    emit?.({ agentSlug: 'supervisor', toolKey: 'get_account_context', status: 'completed', label: `${safeAccounts.length} cuenta${safeAccounts.length === 1 ? '' : 's'} publicitaria${safeAccounts.length === 1 ? '' : 's'} encontrada${safeAccounts.length === 1 ? '' : 's'}` })

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

const getClientMemory: ToolDefinition = {
  key: 'get_client_memory',
  description: 'Recupera el perfil persistente del cliente activo y detecta campos obligatorios faltantes.',
  inputSchema: noInput,
  async execute(_input, context) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_client_memory', status: 'running', label: 'Recuperando contexto del cliente' })
    const { data, error } = await (await createClient()).from('ai_client_profile').select('client_id, industry, commercial_objective, product_type, primary_conversion_type, industry_source, commercial_objective_source, product_type_source, primary_conversion_source').eq('client_id', context.clientId).maybeSingle()
    if (error) {
      console.error('[v0] get_client_memory failed:', error.message)
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_client_memory', status: 'error', label: 'No se pudo recuperar el contexto del cliente' })
      return { available: false, message: 'No se pudo recuperar el contexto persistente del cliente.' }
    }
    const today = new Date()
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - 89)
    const dateFrom = from.toISOString().slice(0, 10)
    const dateTo = today.toISOString().slice(0, 10)
    const { data: historicalRows, error: historicalError } = await (await createClient()).from('paid_media_daily_metrics').select('platform, metric_date, campaign_type, campaign_objective, result_type, currency, spend, leads, conversions').eq('client_id', context.clientId).gte('metric_date', dateFrom).lte('metric_date', dateTo)
    const performance_90d = historicalError ? { ...emptyClientMemory().performance_90d, date_from: dateFrom, date_to: dateTo, error: 'historical_metrics_unavailable' } : buildPerformance90d((historicalRows ?? []) as MetricRow[], today)
    if (historicalError) console.error('[v0] get_client_memory historical metrics unavailable:', historicalError.message)
    const memory = buildClientMemory(data as Record<string, unknown> | null, performance_90d)
    if (context.analysisRunState) context.analysisRunState.clientMemory = memory
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_client_memory', status: 'completed', label: memory.missing_fields.length ? `${memory.missing_fields.length} datos del cliente faltantes` : 'Contexto del cliente completo' })
    return memory
  },
}

const saveClientProfile: ToolDefinition = {
  key: 'save_client_profile',
  description: 'Persiste únicamente datos de perfil explícitamente confirmados por el usuario para el cliente activo.',
  inputSchema: z.object({ industry: z.string().trim().min(1).max(120).optional(), commercial_objective: z.string().trim().min(1).max(200).optional(), product_type: z.string().trim().min(1).max(200).optional(), primary_conversion_type: z.string().trim().min(1).max(80).optional() }).refine((value) => Object.keys(value).length > 0),
  async execute(input: { industry?: string; commercial_objective?: string; product_type?: string; primary_conversion_type?: string }, context) {
    if (!context.clientId) return { success: false, message: 'No hay un cliente activo seleccionado.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'save_client_profile', status: 'running', label: 'Actualizando contexto del cliente' })
    const update: Record<string, unknown> = {}
    const updatedFields: string[] = []
    if (input.industry !== undefined) { update.industry = normalizeIndustry(input.industry); update.industry_source = 'user_confirmed'; update.industry_confirmed_at = new Date().toISOString(); updatedFields.push('industry') }
    if (input.commercial_objective !== undefined) { update.commercial_objective = input.commercial_objective.trim(); update.commercial_objective_source = 'user_confirmed'; update.commercial_objective_confirmed_at = new Date().toISOString(); updatedFields.push('commercial_objective') }
    if (input.product_type !== undefined) { update.product_type = input.product_type.trim(); update.product_type_source = 'user_confirmed'; update.product_type_confirmed_at = new Date().toISOString(); updatedFields.push('product_type') }
    if (input.primary_conversion_type !== undefined) { update.primary_conversion_type = input.primary_conversion_type.trim(); update.primary_conversion_source = 'user_confirmed'; update.primary_conversion_confirmed_at = new Date().toISOString(); updatedFields.push('primary_conversion_type') }
    const { error } = await (await createClient()).from('ai_client_profile').upsert({ client_id: context.clientId, ...update, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    if (error) { console.error('[v0] save_client_profile failed:', error.message); context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'save_client_profile', status: 'error', label: 'No se pudo actualizar el contexto del cliente' }); return { success: false, message: 'No se pudo actualizar el perfil del cliente.' } }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'save_client_profile', status: 'completed', label: 'Contexto del cliente actualizado' })
    return { success: true, updated_fields: updatedFields }
  },
}

const getIndustryBenchmark: ToolDefinition = {
  key: 'get_industry_benchmark',
  description: 'Calcula un benchmark descriptivo y anonimizado usando clientes de la misma industria.',
  inputSchema: z.object({ days: z.number().int().min(30).max(365).optional() }),
  async execute(input: { days?: number }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, error: 'missing_client_id', message: 'No hay un cliente activo seleccionado.' }
    const supabase = await createClient()
    const { data: profile, error: profileError } = await supabase.from('ai_client_profile').select('client_id, industry').eq('client_id', context.clientId).maybeSingle()
    const days = input.days ?? 90
    const to = new Date()
    const from = new Date(to); from.setUTCDate(from.getUTCDate() - days + 1)
    const period = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
    if (profileError || !profile?.industry) {
      const benchmark: IndustryBenchmark = { available: false, industry: profile?.industry ?? null, peer_client_ids: [], period, sample_size: 0, metrics: { spend: null, impressions: null, clicks: null, results: null, leads: null, conversions: null, cpl: null, ctr: null }, methodology: 'Sin benchmark: el perfil activo no tiene industry disponible.', limitations: ['industry_missing'], error: profileError ? 'profile_unavailable' : 'industry_missing' }
      if (context.analysisRunState) context.analysisRunState.industryBenchmark = benchmark
      return benchmark
    }
    const { data: peerProfiles, error: peersError } = await supabase.from('ai_client_profile').select('client_id, industry').ilike('industry', profile.industry.trim()).neq('client_id', context.clientId)
    const peerIds = (peerProfiles ?? []).map((peer) => peer.client_id).filter((id): id is string => typeof id === 'string')
    if (peersError || peerIds.length === 0) {
      const benchmark: IndustryBenchmark = { available: false, industry: profile.industry, peer_client_ids: [], period, sample_size: 0, metrics: { spend: null, impressions: null, clicks: null, results: null, leads: null, conversions: null, cpl: null, ctr: null }, methodology: 'Benchmark peer descriptivo por industry exacta, excluyendo el cliente activo.', limitations: [peersError ? 'peer_profiles_unavailable' : 'no_peers'] , error: peersError ? 'peer_profiles_unavailable' : 'no_peers' }
      if (context.analysisRunState) context.analysisRunState.industryBenchmark = benchmark
      return benchmark
    }
    const { data: rows, error: metricsError } = await supabase.from('paid_media_daily_metrics').select('client_id, spend, impressions, clicks, results, leads, conversions, metric_date').in('client_id', peerIds).gte('metric_date', period.from).lte('metric_date', period.to)
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0
    const grouped = new Map<string, Record<string, number>>()
    for (const row of (rows ?? []) as Array<Record<string, unknown> & { client_id: string }>) { const current = grouped.get(row.client_id) ?? { spend: 0, impressions: 0, clicks: 0, results: 0, leads: 0, conversions: 0 }; for (const key of ['spend', 'impressions', 'clicks', 'results', 'leads', 'conversions'] as const) current[key] += number(row[key]); grouped.set(row.client_id, current) }
    const peerTotals = [...grouped.values()]
    const average = (key: string) => peerTotals.length ? peerTotals.reduce((sum, row) => sum + row[key], 0) / peerTotals.length : null
    const spend = average('spend'); const clicks = average('clicks'); const impressions = average('impressions'); const leads = average('leads'); const conversions = average('conversions'); const results = average('results')
    const benchmark: IndustryBenchmark = { available: !metricsError && peerTotals.length >= 3, industry: profile.industry, peer_client_ids: [...grouped.keys()], period, sample_size: peerTotals.length, metrics: { spend, impressions, clicks, results, leads, conversions, cpl: spend !== null && leads && leads > 0 ? spend / leads : null, ctr: impressions && impressions > 0 && clicks !== null ? clicks / impressions : null }, methodology: 'Promedio simple por cliente peer con al menos una fila de paid_media_daily_metrics en el período; no ponderado por inversión.', limitations: [...(metricsError ? ['metrics_unavailable'] : []), ...(peerTotals.length < 3 ? ['minimum_peer_sample_not_met'] : [])], error: metricsError ? 'peer_metrics_unavailable' : undefined }
    if (context.analysisRunState) context.analysisRunState.industryBenchmark = benchmark
    return benchmark
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
    // La cuenta elegida por el usuario en la UI (context.metaAccountId)
    // siempre restringe el universo de cuentas, incluso si el modelo no
    // pasó accountId explícito en la tool call.
    const selectionIds = parseSelectedAccountIds(context.metaAccountId, normalizeMetaAccountId)
    const restrictedAccounts = selectionIds ? availableAccounts.filter((account) => selectionIds.has(normalizeMetaAccountId(account.id_cuenta))) : availableAccounts
    const selected = input.accountId
      ? restrictedAccounts.filter((account) => normalizeMetaAccountId(account.id_cuenta) === normalizeMetaAccountId(input.accountId!))
      : restrictedAccounts
    if (input.accountId && selected.length === 0) return { available: false, message: 'La cuenta solicitada no pertenece al cliente seleccionado.' }
    if (selectionIds && restrictedAccounts.length === 0) return { available: false, message: 'La cuenta seleccionada en la interfaz no pertenece al cliente activo.' }
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
    // La cuenta elegida por el usuario en la UI (context.googleCustomerId)
    // siempre restringe el universo de cuentas, incluso si el modelo no
    // pasó accountId explícito en la tool call.
    const selectionIds = parseSelectedAccountIds(context.googleCustomerId, normalizeCustomerId)
    const restrictedAccounts = selectionIds ? availableAccounts.filter((account) => selectionIds.has(normalizeCustomerId(account.id_cuenta))) : availableAccounts
    const selected = input.accountId
      ? restrictedAccounts.filter((account) => normalizeCustomerId(account.id_cuenta) === normalizeCustomerId(input.accountId!))
      : restrictedAccounts
    if (input.accountId && selected.length === 0) return { available: false, message: 'La cuenta solicitada no pertenece al cliente seleccionado.' }
    if (selectionIds && restrictedAccounts.length === 0) return { available: false, message: 'La cuenta seleccionada en la interfaz no pertenece al cliente activo.' }
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
  description: 'Lee el historial persistido de cambios de paid media del cliente. Filtra por plataforma, cuenta, período, entidad, categorías o actor; nunca reemplaza las métricas.',
  inputSchema: z.object({ platform: z.enum(['google', 'meta']).nullable(), dateFrom: z.string().nullable(), dateTo: z.string().nullable(), accountId: z.string().nullable(), entityType: z.string().nullable(), entityId: z.string().nullable(), sourceEventIds: z.array(z.string()).max(200).nullable(), fieldCategories: z.array(z.string()).nullable(), actorEmail: z.string().nullable(), limit: z.number().int().min(1).max(200).nullable() }),
  async execute(input: { platform?: 'google' | 'meta' | null; dateFrom?: string | null; dateTo?: string | null; accountId?: string | null; entityType?: string | null; entityId?: string | null; sourceEventIds?: string[] | null; fieldCategories?: string[] | null; actorEmail?: string | null; limit?: number | null }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, events: [], message: 'No hay un cliente activo seleccionado.' }
    if ((input.dateFrom && !input.dateTo) || (!input.dateFrom && input.dateTo)) return { available: false, events: [], message: 'Debes indicar dateFrom y dateTo juntos.' }
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_account_change_history', status: 'running', label: `Consultando historial${input.platform ? ` de ${input.platform}` : ''}...` })
    let query = (await createClient()).from('paid_media_change_events').select('platform, account_id, account_name, source_event_id, occurred_at, actor_id, actor_name, actor_email, client_type, entity_type, entity_id, entity_name, operation, changed_fields, field_categories, source, raw_metadata').eq('client_id', context.clientId).order('occurred_at', { ascending: false }).limit(limit)
    if (input.platform) query = query.eq('platform', input.platform)
    if (input.accountId) query = query.eq('account_id', input.accountId)
    if (input.sourceEventIds?.length) query = query.in('source_event_id', input.sourceEventIds)
    if (input.entityType) query = query.eq('entity_type', input.entityType)
    if (input.entityId) query = query.eq('entity_id', input.entityId)
    if (input.actorEmail) query = query.eq('actor_email', input.actorEmail)
    if (input.dateFrom) query = query.gte('occurred_at', input.dateFrom)
    if (input.dateTo) query = query.lte('occurred_at', `${input.dateTo}T23:59:59.999Z`)
    if (input.fieldCategories?.length) query = query.overlaps('field_categories', input.fieldCategories)
    const { data, error } = await query
    if (error) { context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_account_change_history', status: 'error', label: 'No se pudo leer el historial de cambios' }); return { available: false, events: [], message: 'No se pudo leer el historial persistido.' } }
    const events = (data ?? []).map((row) => ({ platform: row.platform, account_id: row.account_id, occurred_at: row.occurred_at, actor: { id: row.actor_id, name: row.actor_name, email: row.actor_email }, source: row.source, entity: { type: row.entity_type, id: row.entity_id, name: row.entity_name }, operation: row.operation, changed_fields: row.changed_fields ?? [], metadata: { resource_name: row.source_event_id, client_type: row.client_type, raw_change_resource_type: row.entity_type } }))
    if (context.analysisRunState) upsertChangeHistory(context.analysisRunState, events)
    if (context.conversationWorkingContext && events.length) {
      context.conversationWorkingContext = mergeWorkingContext(context.conversationWorkingContext, contextFromEvents(context.clientId, events, input.dateFrom && input.dateTo ? { from: input.dateFrom, to: input.dateTo } : null))
    }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_account_change_history', status: 'completed', label: events.length ? `${events.length} cambios encontrados` : 'No hay eventos registrados para los filtros solicitados' })
    return { available: true, events, count: events.length, message: events.length ? undefined : 'No hay eventos registrados para los filtros solicitados.' }
  },
}

const getGoogleChangeHistoryTool: ToolDefinition = { ...getAccountChangeHistory, key: 'get_google_change_history', description: 'Compatibilidad legacy: consultá get_account_change_history para el historial persistido multiplataforma.' }

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
      const outputAccountIds = new Set(output.entity.account_ids)
      const expectedPeriod = currentSnapshots[0].period
      const expectedPlatform = [...new Set(currentSnapshots.map((snapshot) => snapshot.platform))].length === 1 ? currentSnapshots[0].platform : 'mixed'
      const entityMatches = output.entity.client_id === context.clientId &&
        output.entity.platform === expectedPlatform &&
        output.entity.account_ids.every((accountId) => expectedAccountIds.has(accountId)) &&
        outputAccountIds.size === expectedAccountIds.size &&
        output.entity.period.from === expectedPeriod.from &&
        output.entity.period.to === expectedPeriod.to
      if (!entityMatches) {
        console.log('[v0] performance analyst output entity validation', { client_matches: output.entity.client_id === context.clientId, platform_matches: output.entity.platform === expectedPlatform, account_ids_subset: [...outputAccountIds].every((accountId) => expectedAccountIds.has(accountId)), account_ids_complete: outputAccountIds.size === expectedAccountIds.size, period_matches: output.entity.period.from === expectedPeriod.from && output.entity.period.to === expectedPeriod.to })
        output.entity = {
          ...output.entity,
          client_id: context.clientId,
          platform: expectedPlatform as 'google' | 'meta' | 'mixed',
          account_ids: [...expectedAccountIds],
          period: expectedPeriod,
        }
      }
      const validatedOutput = SpecialistOutputSchema.parse(output)
      state.specialistOutputs.push(validatedOutput)
      context.emitActivity?.({ agentSlug: 'performance-analyst', toolKey: 'run_performance_analyst', status: 'completed', label: 'Analista de Performance completó el análisis' })
      return validatedOutput
    } catch (cause) {
      console.error('[v0] Performance Analyst invalid output', cause instanceof Error ? cause.message : cause)
      try {
        const repaired = await runPerformanceAnalyst({ context, snapshots: currentSnapshots, comparisonSnapshots, changeHistory: state.changeHistory, model: 'openai/gpt-4.1-mini-fast' })
        const validatedRepair = SpecialistOutputSchema.parse(repaired)
        state.specialistOutputs.push(validatedRepair)
        context.emitActivity?.({ agentSlug: 'performance-analyst', toolKey: 'run_performance_analyst', status: 'completed', label: 'Analista de Performance completó el análisis' })
        return validatedRepair
      } catch (retryCause) {
        console.error('[v0] Performance Analyst repair failed', retryCause instanceof Error ? retryCause.message : retryCause)
        context.emitActivity?.({ agentSlug: 'performance-analyst', toolKey: 'run_performance_analyst', status: 'error', label: 'El analista no devolvió un diagnóstico validado' })
        return { available: false, code: 'SPECIALIST_OUTPUT_INVALID', specialist_status: 'invalid_output', message: 'No se pudo generar un diagnóstico validado.' }
      }
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
  getClientMemory,
  saveClientProfile,
  getIndustryBenchmark,
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

export function getCatalogToolKeys(): string[] {
  return allTools.map((definition) => definition.key)
}

export function getToolCatalog() {
  return allTools.map(({ key, description }) => ({ key, description }))
}
