import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ExecutionContext, ToolDefinition } from '../types'
import { getGoogleAccountMetrics, defaultGoogleDateRange, normalizeCustomerId, splitCustomerIds } from '@/lib/google-ads/service'
import { defaultMetaDateRange, getMetaAccountMetrics, getMetaErrorDetails, normalizeMetaAccountId } from '@/lib/meta-ads/service'
import { buildCampaignComparisons, compareMetric, upsertChangeHistory, upsertPaidMediaSnapshot, SpecialistOutputSchema, type IndustryBenchmark } from '@/lib/ai/contracts/performance-analyst'
import { runPerformanceAnalyst } from '@/lib/ai/specialists/performance-analyst'
import { contextFromEvents, mergeWorkingContext } from '@/lib/ai/conversation-context'
import { buildClientMemory, buildPerformance90d, emptyClientMemory, normalizeIndustry, type MetricRow } from '@/lib/ai/client-memory'
import { getBuenosAiresLastSevenDays, getGoogleAnalyticsReport, getGoogleAnalyticsSales } from '@/lib/google-analytics/service'
import { createCrmClient } from '@/lib/supabase/crm'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

const noInput = z.object({})

/**
 * El CRM externo de Aurelia identifica a cada cliente con su propio UUID de
 * cuenta/location (columna `client_id` en sus tablas remotas), que NO es
 * igual a nuestro `clientId` interno. Un mismo cliente interno puede tener
 * además varias cuentas de Aurelia vinculadas (ver `client_crm_accounts`).
 * Esta función resuelve el/los UUID(s) reales del CRM para poder filtrar
 * correctamente las consultas remotas.
 */
async function resolveCrmAccountIds(clientId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: clienteRow }, { data: extraAccounts }] = await Promise.all([
    admin.from('clientes').select('crm_location_id, ghl_location_id').eq('id', clientId).maybeSingle(),
    admin.from('client_crm_accounts').select('crm_account_id').eq('client_id', clientId).eq('crm_type', 'aurelia').eq('active', true),
  ])
  const primaryId = clienteRow?.crm_location_id ?? clienteRow?.ghl_location_id ?? null
  const extraIds = (extraAccounts ?? []).map((row: { crm_account_id: string }) => row.crm_account_id)
  return [...new Set([primaryId, ...extraIds].filter(Boolean) as string[])]
}

const CONTEXT_FIELD_LIMIT = 1200
const CONTEXT_COMMENT_LIMIT = 1800

function compactValue(value: unknown, limit = CONTEXT_FIELD_LIMIT): unknown {
  if (typeof value === 'string') return value.length > limit ? `${value.slice(0, limit)}…` : value
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => compactValue(item, limit))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, compactValue(item, limit)]))
  }
  return value
}

function compactRecords(records: unknown[] | null | undefined, limit: number, count = 100) {
  return (records ?? []).slice(0, count).map((record) => compactValue(record, limit))
}

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
  description: 'Obtiene el contexto global del cliente activo: tarjeta completa, cuentas seleccionadas, tareas, hitos y comentarios del cliente y de sus tareas dentro del período analizado.',
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
      .select('*')
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

    const period = context.analysisRunState?.comparisonDefinition?.current
    const periodFilter = (query: any, dateColumn = 'created_at') => period
      ? query.gte(dateColumn, `${period.from}T00:00:00.000Z`).lte(dateColumn, `${period.to}T23:59:59.999Z`)
      : query
    const [{ data: tasks, error: tasksError }, { data: instances, error: instancesError }, { data: clientComments, error: clientCommentsError }] = await Promise.all([
      supabase.from('tareas').select('*').eq('cliente_id', context.clientId).order('created_at', { ascending: false }).limit(40),
      supabase.from('mapa_servicio_instancias').select('*, hitos_catalogo(nombre, frecuencia, tipo_servicio)').eq('cliente_id', context.clientId).limit(40),
      periodFilter(
        supabase
          .from('comentarios_clientes')
          .select('id, cliente_id, contenido, autor, colaborador_id, tipo, creado_en, actualizado_en')
          .eq('cliente_id', context.clientId)
          .order('creado_en', { ascending: false })
          .limit(80),
        'creado_en'
      ),
    ])
    if (tasksError) console.warn('[v0] get_account_context tasks unavailable:', tasksError.message)
    if (instancesError) console.warn('[v0] get_account_context milestones unavailable:', instancesError.message)
    if (clientCommentsError) console.warn('[v0] get_account_context client comments unavailable:', clientCommentsError.message)

    const taskIds = (tasks ?? []).map((task: { id?: string }) => task.id).filter(Boolean)
    const { data: taskComments, error: taskCommentsError } = taskIds.length > 0
      ? await supabase.from('comentarios_tareas').select('*').in('tarea_id', taskIds).order('created_at', { ascending: false }).limit(150)
      : { data: [], error: null }
    if (taskCommentsError) console.warn('[v0] get_account_context task comments unavailable:', taskCommentsError.message)

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
    const analyticsSelection = context.analyticsPropertyId?.trim() || null
    if (!metaSelection && !googleSelection && !analyticsSelection) {
      return { available: false, message: 'Seleccioná al menos una cuenta o plataforma conectada antes de iniciar el análisis.' }
    }
    const safeAccounts = allAccounts.filter((account) => {
      const platform = account.plataforma?.toLowerCase()
      if (platform === 'meta' && metaSelection) return metaSelection.has(normalizeMetaAccountId(account.id_cuenta))
      if (platform === 'google' && googleSelection) return googleSelection.has(normalizeCustomerId(account.id_cuenta))
      return true
    })

    const google = safeAccounts.find((account) => account.plataforma?.toLowerCase() === 'google')
    const meta = safeAccounts.find((account) => account.plataforma?.toLowerCase() === 'meta')
    const selectedTimezones = [...new Set(safeAccounts.map((account) => account.zona_horaria).filter(Boolean))]
    const analysisPeriod = period
      ? {
          date_from: period.from,
          time_from: '00:00:00',
          date_to: period.to,
          time_to: '23:59:59',
          timezones: selectedTimezones,
          attribution_note: selectedTimezones.length === 1
            ? `Las fechas se interpretan en la zona horaria de la cuenta: ${selectedTimezones[0]}.`
            : 'Las cuentas seleccionadas tienen zonas horarias diferentes; interpretar cada métrica en la zona horaria informada por su cuenta.',
        }
      : null

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
      tarjeta_cliente: compactValue(client, CONTEXT_FIELD_LIMIT),
      cuentas_publicitarias: safeAccounts,
      tareas: compactRecords(tasks, CONTEXT_FIELD_LIMIT, 40),
      comentarios_cliente_en_periodo: compactRecords(clientComments, CONTEXT_COMMENT_LIMIT, 80),
      comentarios_de_tareas: compactRecords(taskComments, CONTEXT_COMMENT_LIMIT, 150),
      hitos_asignados: compactRecords(instances, CONTEXT_FIELD_LIMIT, 40),
      periodo_analizado: analysisPeriod,
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
    if (!selectionIds) return { available: false, message: 'Seleccioná al menos una cuenta de Meta Ads en el selector antes de analizar.' }
    const restrictedAccounts = availableAccounts.filter((account) => selectionIds.has(normalizeMetaAccountId(account.id_cuenta)))
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
  date_range: { start: dateFrom, start_time: '00:00:00', end: dateTo, end_time: '23:59:59', timezones: [...new Set(selected.map((account) => account.zona_horaria).filter(Boolean))] },
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
    if (!selectionIds) return { available: false, message: 'Seleccioná al menos una cuenta de Google Ads en el selector antes de analizar.' }
    const restrictedAccounts = availableAccounts.filter((account) => selectionIds.has(normalizeCustomerId(account.id_cuenta)))
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
    return { available: true, partial: successful.length !== selected.length, date_range: { start: dateFrom, start_time: '00:00:00', end: dateTo, end_time: '23:59:59', timezones: [...new Set(selected.map((account) => account.zona_horaria).filter(Boolean))] }, accounts: successful.map((result) => result.metrics), errors: results.filter((result) => result.error).map((result) => ({ account_id: result.account.id_cuenta, account_name: result.account.nombre_cuenta, message: result.error })) }
  },
}

const getGoogleAnalyticsReportTool: ToolDefinition = {
  key: 'get_google_analytics_report',
  description: 'Obtiene un reporte resumido de Google Analytics 4 para la propiedad del cliente: resumen, hasta 100 filas relevantes de eventos, adquisición, páginas, dispositivos, geografía y evolución diaria. Usala para cualquier análisis de GA4; si se necesita un detalle específico, consultá la pregunta del usuario y profundizá con la herramienta adecuada.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const argentinaRange = getBuenosAiresLastSevenDays()
    const dateTo = input.dateTo ?? argentinaRange.dateTo
    const dateFrom = input.dateFrom ?? argentinaRange.dateFrom
    const supabase = await createClient()
    const { data: client, error } = await supabase.from('clientes').select('analytics_property_id').eq('id', context.clientId).single()
    if (error || !client?.analytics_property_id) return { available: false, message: 'El cliente no tiene una propiedad de Google Analytics 4 asignada en la configuración de plataforma.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_report', status: 'running', label: 'Consultando información completa de Google Analytics 4...' })
    try {
      const report = await getGoogleAnalyticsReport(client.analytics_property_id, dateFrom, dateTo)
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_report', status: 'completed', label: 'Información de Google Analytics 4 recibida' })
      return { available: true, source: 'Google Analytics 4', timeZone: argentinaRange.timeZone, ...report }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo consultar Google Analytics 4.'
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_report', status: 'error', label: 'No se pudo consultar Google Analytics 4' })
      return { available: false, message }
    }
  },
}

const getGoogleAnalyticsSalesTool: ToolDefinition = {
  key: 'get_google_analytics_sales',
  description: 'Consulta ventas reales de Google Analytics 4 usando el evento purchase de la propiedad GA4 asignada al cliente. Usala cuando el usuario pregunte por ventas, compras, transacciones o ingresos de Analytics.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const argentinaRange = getBuenosAiresLastSevenDays()
    const dateTo = input.dateTo ?? argentinaRange.dateTo
    const dateFrom = input.dateFrom ?? argentinaRange.dateFrom
    const supabase = await createClient()
    const { data: client, error } = await supabase.from('clientes').select('analytics_property_id').eq('id', context.clientId).single()
    if (error || !client?.analytics_property_id) return { available: false, message: 'El cliente no tiene una propiedad de Google Analytics 4 asignada en la configuración de plataforma.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_sales', status: 'running', label: 'Consultando ventas de Google Analytics 4...' })
    try {
      const sales = await getGoogleAnalyticsSales(client.analytics_property_id, dateFrom, dateTo)
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_sales', status: 'completed', label: 'Ventas de Google Analytics 4 recibidas' })
      return { available: true, source: 'Google Analytics 4', event: 'purchase', ...sales }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudieron consultar las ventas de Google Analytics 4.'
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_sales', status: 'error', label: 'No se pudieron consultar las ventas de Google Analytics 4' })
      return { available: false, message }
    }
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

const getCrmContext: ToolDefinition = {
  key: 'get_crm_context',
  description: 'Consulta ventas y contexto comercial sincronizado del CRM externo: contactos, conversaciones, mensajes y oportunidades del cliente activo dentro del período analizado.',
  inputSchema: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    contactId: z.string().optional(),
    conversationId: z.string().optional(),
  }),
  async execute(input: { from?: string; to?: string; contactId?: string; conversationId?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay cliente activo seleccionado.' }
    const supabase = await createClient()
    const period = context.analysisRunState?.comparisonDefinition?.current
    const from = input.from ?? period?.from
    const to = input.to ?? period?.to
    const dateFilter = (query: any, column = 'crm_created_at') => from && to
      ? query.gte(column, `${from}T00:00:00.000Z`).lte(column, `${to}T23:59:59.999Z`)
      : query
    const [{ data: contacts, error: contactsError }, { data: conversations, error: conversationsError }, { data: messages, error: messagesError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
      dateFilter(supabase.from('crm_contacts').select('external_id, client_id, contact_data, source, status, crm_created_at, crm_updated_at').eq('client_id', context.clientId).limit(100)),
      dateFilter(supabase.from('crm_conversations').select('external_id, client_id, contact_external_id, conversation_data, channel, status, crm_created_at, crm_updated_at').eq('client_id', context.clientId).limit(100)),
      dateFilter(supabase.from('crm_messages').select('external_id, client_id, conversation_external_id, contact_external_id, message_data, source_id, referral_metadata, direction, author, created_at, crm_created_at').eq('client_id', context.clientId).not('source_id', 'is', null).limit(250)),
      dateFilter(supabase.from('crm_opportunities').select('external_id, client_id, contact_external_id, opportunity_data, stage, status, value, source, crm_created_at, crm_updated_at').eq('client_id', context.clientId).limit(100)),
    ])
    return { available: !(contactsError || conversationsError || messagesError || opportunitiesError), period: { from, to, start_time: '00:00:00', end_time: '23:59:59' }, contacts: compactRecords(contacts, CONTEXT_FIELD_LIMIT, 100), conversations: compactRecords(conversations, CONTEXT_FIELD_LIMIT, 100), messages: compactRecords(messages, CONTEXT_COMMENT_LIMIT, 250), opportunities: compactRecords(opportunities, CONTEXT_FIELD_LIMIT, 100), errors: [contactsError, conversationsError, messagesError, opportunitiesError].filter(Boolean).map((error) => error?.message) }
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

const crmOpportunities: ToolDefinition = {
  key: 'crm_opportunities',
  description: 'Lista todas las oportunidades del CRM externo de Aurelia dentro de un período, incluyendo estado, etapa, vendedor, contacto y monto.',
  inputSchema: z.object({ dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async execute(input: { dateFrom: string; dateTo: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const crmAccountIds = await resolveCrmAccountIds(context.clientId)
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de Aurelia CRM vinculada.' }
    const crm = createCrmClient()
    const start = new Date(`${input.dateFrom}T00:00:00-03:00`).toISOString()
    const endExclusive = new Date(`${input.dateTo}T00:00:00-03:00`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const end = endExclusive.toISOString()
    const opportunities: any[] = []
    try {
      for (let offset = 0; offset < 10000; offset += 100) {
        const { data, error } = await crm.from('opportunities').select('id,created_at,client_id,contact_id,pipeline_id,stage_id,assigned_user,status,conversation_id,assigned_team_id,assigned_type,amount,currency').in('client_id', crmAccountIds).gte('created_at', start).lt('created_at', end).range(offset, offset + 99)
        if (error) throw new Error(`opportunities: ${error.message}`)
        opportunities.push(...(data ?? []))
        if ((data ?? []).length < 100) break
      }
      const contactIds = [...new Set(opportunities.map(row => row.contact_id).filter(Boolean))]
      const pipelineIds = [...new Set(opportunities.map(row => row.pipeline_id).filter(Boolean))]
      const [contactsResult, stagesResult] = await Promise.all([
        contactIds.length ? crm.from('contacts').select('id,name,email,phone').in('client_id', crmAccountIds).in('id', contactIds) : Promise.resolve({ data: [], error: null }),
        pipelineIds.length ? crm.from('pipeline_stages').select('id,pipeline_id,name,description').in('client_id', crmAccountIds).in('pipeline_id', pipelineIds) : Promise.resolve({ data: [], error: null }),
      ])
      if (contactsResult.error) throw new Error(`contacts: ${contactsResult.error.message}`)
      if (stagesResult.error) throw new Error(`pipeline_stages: ${stagesResult.error.message}`)
      const contactsById = new Map((contactsResult.data ?? []).map(row => [row.id, row]))
      const stagesById = new Map((stagesResult.data ?? []).map(row => [row.id, row]))
      const rows = opportunities.map(opportunity => ({ ...opportunity, contact: contactsById.get(opportunity.contact_id) ?? null, stage: stagesById.get(opportunity.stage_id) ?? null }))
      const byStatus = rows.reduce<Record<string, number>>((summary, row) => { const status = String(row.status ?? 'sin_estado'); summary[status] = (summary[status] ?? 0) + 1; return summary }, {})
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_opportunities', status: 'completed', label: `${rows.length} oportunidades consultadas` })
      return { available: true, period: { date_from: input.dateFrom, date_to: input.dateTo, timezone: 'America/Argentina/Buenos_Aires', query_start_utc: start, query_end_exclusive_utc: end }, totals: { opportunities: rows.length, by_status: byStatus, amount: rows.reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0) }, opportunities: rows.slice(0, 500), truncated: rows.length > 500 }
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_opportunities', status: 'error', label: 'No se pudieron consultar las oportunidades' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar Aurelia CRM.' }
    }
  },
}

const crmContacts: ToolDefinition = {
  key: 'crm_contacts',
  description: 'Lista y cuenta todos los contactos creados en el CRM externo de Aurelia dentro de un período, sin filtrar por ventas u oportunidades. Usala para responder cuántos contactos se crearon o registraron en un rango de fechas.',
  inputSchema: z.object({ dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async execute(input: { dateFrom: string; dateTo: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const crmAccountIds = await resolveCrmAccountIds(context.clientId)
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de Aurelia CRM vinculada.' }
    const crm = createCrmClient()
    const start = new Date(`${input.dateFrom}T00:00:00-03:00`).toISOString()
    const endExclusive = new Date(`${input.dateTo}T00:00:00-03:00`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const end = endExclusive.toISOString()
    const contacts: any[] = []
    try {
      for (let offset = 0; offset < 10000; offset += 100) {
        const { data, error } = await crm.from('contacts').select('id,created_at,client_id,name,email,phone').in('client_id', crmAccountIds).gte('created_at', start).lt('created_at', end).range(offset, offset + 99)
        if (error) throw new Error(`contacts: ${error.message}`)
        contacts.push(...(data ?? []))
        if ((data ?? []).length < 100) break
      }
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_contacts', status: 'completed', label: `${contacts.length} contactos consultados` })
      return { available: true, period: { date_from: input.dateFrom, date_to: input.dateTo, timezone: 'America/Argentina/Buenos_Aires', query_start_utc: start, query_end_exclusive_utc: end }, totals: { contacts: contacts.length }, contacts: contacts.slice(0, 500), truncated: contacts.length > 500 }
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_contacts', status: 'error', label: 'No se pudieron consultar los contactos' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar Aurelia CRM.' }
    }
  },
}

const crmSalesAttribution: ToolDefinition = {
  key: 'crm_sales_attribution',
  description: 'Relaciona oportunidades ganadas del CRM externo de Aurelia con contactos, mensajes inbound con referral/source_id y conversaciones asignadas. Usala para responder ventas por campaña o anuncio. NO usar para contar el total de contactos creados: para eso usar crm_contacts.',
  inputSchema: z.object({ dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async execute(input: { dateFrom: string; dateTo: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const crmAccountIds = await resolveCrmAccountIds(context.clientId)
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de Aurelia CRM vinculada.' }
    const crm = createCrmClient()
    const start = `${input.dateFrom}T00:00:00.000Z`
    const end = `${input.dateTo}T23:59:59.999Z`
    const batch = async (table: string, columns: string, filters: (query: any) => any, maxRows = 2000) => {
      const rows: any[] = []
      for (let offset = 0; offset < maxRows; offset += 100) {
        let query = filters(crm.from(table).select(columns))
        const { data, error } = await query.range(offset, offset + 99)
        if (error) throw new Error(`${table}: ${error.message}`)
        rows.push(...(data ?? []))
        if ((data ?? []).length < 100) break
      }
      return rows
    }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'running', label: 'Analizando ventas y atribución del CRM...' })
    try {
      const opportunities = await batch('opportunities', 'id,created_at,client_id,contact_id,pipeline_id,stage_id,assigned_user,status,conversation_id,assigned_team_id,assigned_type,amount,currency', query => query.in('client_id', crmAccountIds).gte('created_at', start).lte('created_at', end), 5000)
      const contactIds = [...new Set(opportunities.map(row => row.contact_id).filter(Boolean))]
      const conversationIds = [...new Set(opportunities.map(row => row.conversation_id).filter(Boolean))]
      const pipelineIds = [...new Set(opportunities.map(row => row.pipeline_id).filter(Boolean))]
      const [contacts, messages, conversations, stages] = await Promise.all([
        contactIds.length ? batch('contacts', 'id,created_at,client_id,name,email,phone', query => query.in('client_id', crmAccountIds).in('id', contactIds)) : Promise.resolve([]),
        contactIds.length ? batch('messages', 'id,created_at,client_id,contact_id,conversation_id,message_type,direction,status,source,delivered_at,metadata', query => query.in('client_id', crmAccountIds).in('contact_id', contactIds).eq('direction', 'inbound').not('metadata', 'is', null).gte('created_at', start).lte('created_at', end)) : Promise.resolve([]),
        conversationIds.length ? batch('conversations', 'id,client_id,contact_id,assigned_agent,assigned_user,importance,unread_count,sub_channel_id,assigned_team_id', query => query.in('client_id', crmAccountIds).in('id', conversationIds)) : Promise.resolve([]),
        pipelineIds.length ? batch('pipeline_stages', 'id,client_id,pipeline_id,name,description', query => query.in('client_id', crmAccountIds).in('pipeline_id', pipelineIds)) : Promise.resolve([]),
      ])
      const contactsById = new Map(contacts.map(row => [row.id, row]))
      const stagesById = new Map(stages.map(row => [row.id, row]))
      const conversationsById = new Map(conversations.map(row => [row.id, row]))
      const referralsByContact = new Map<string, any>()
      for (const message of messages) {
        const referral = message.metadata?.referral
        if (message.contact_id && referral && !referralsByContact.has(message.contact_id)) referralsByContact.set(message.contact_id, { ...message, referral, ad_id: referral.source_id ?? referral.ad_id ?? null, ad_title: referral.ad_title ?? null })
      }
      const won = opportunities.filter(row => String(row.status ?? '').toLowerCase() === 'won' || String(row.status ?? '').toLowerCase() === 'ganado')
      const attributed = won.map(opportunity => {
        const referral = referralsByContact.get(opportunity.contact_id)
        const conversation = conversationsById.get(opportunity.conversation_id ?? referral?.conversation_id)
        return { opportunity, contact: contactsById.get(opportunity.contact_id) ?? null, stage: stagesById.get(opportunity.stage_id) ?? null, referral: referral ?? null, conversation: conversation ?? null }
      })
      const byCampaign = new Map<string, any>()
      for (const sale of attributed) { const key = sale.referral?.ad_id ?? 'unattributed'; const current = byCampaign.get(key) ?? { ad_id: key === 'unattributed' ? null : key, ad_title: sale.referral?.ad_title ?? null, sales: 0, amount: 0 }; current.sales += 1; current.amount += Number(sale.opportunity.amount ?? 0) || 0; byCampaign.set(key, current) }
      const result = { available: true, period: { date_from: input.dateFrom, date_to: input.dateTo }, totals: { won_sales: won.length, attributed_sales: attributed.filter(sale => sale.referral?.ad_id).length, unattributed_sales: attributed.filter(sale => !sale.referral?.ad_id).length, amount: won.reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0) }, by_campaign: [...byCampaign.values()], sales: attributed.slice(0, 100), truncated: attributed.length > 100 }
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'completed', label: `${won.length} ventas ganadas analizadas` })
      return result
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'error', label: 'No se pudo analizar el CRM' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar Aurelia CRM.' }
    }
  },
}

const allTools: ToolDefinition[] = [
  crmOpportunities,
  crmContacts,
  crmSalesAttribution,
  getAccountContext,
  getCrmContext,
  getClientMemory,
  saveClientProfile,
  getIndustryBenchmark,
  getMetaMetrics,
  getGoogleMetrics,
  getGoogleAnalyticsReportTool,
  getGoogleAnalyticsSalesTool,
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
