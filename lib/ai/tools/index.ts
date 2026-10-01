import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ExecutionContext, ToolDefinition } from '../types'
import { getGoogleAccountMetrics, defaultGoogleDateRange, normalizeCustomerId, splitCustomerIds } from '@/lib/google-ads/service'
import { defaultMetaDateRange, getMetaAccountMetrics, getMetaErrorDetails, normalizeMetaAccountId } from '@/lib/meta-ads/service'
import { buildCampaignComparisons, compareMetric, upsertChangeHistory, upsertPaidMediaSnapshot, SpecialistOutputSchema, type IndustryBenchmark } from '@/lib/ai/contracts/performance-analyst'
import { runPerformanceAnalyst } from '@/lib/ai/specialists/performance-analyst'
import { contextFromEvents, mergeWorkingContext } from '@/lib/ai/conversation-context'
import { buildClientMemory, buildPerformance90d, emptyClientMemory, normalizeIndustry, type MetricRow } from '@/lib/ai/client-memory'
import { getBuenosAiresLastSevenDays, getGoogleAnalyticsReport, getGoogleAnalyticsSales, getGoogleAnalyticsPageMetrics } from '@/lib/google-analytics/service'
import { getGoogleTagManagerReport } from '@/lib/google-tag-manager/service'
import { createCrmClient } from '@/lib/supabase/crm'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { buildClaudeDesignBrief, normalizeReportPlan, type ReportPlan } from '@/lib/ai/claude-design-prompts'

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

/**
 * El CRM externo de Aurelia corre en un proyecto Supabase aparte. Bajo
 * consultas concurrentes (paginación + Promise.all) esa API a veces devuelve
 * un fallo de red puntual ("TypeError: fetch failed") que no refleja un
 * problema real de datos. Reintenta esos errores transitorios antes de
 * abortar la herramienta completa.
 */
async function withCrmRetry<T>(
  run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  maxAttempts = 3,
): Promise<{ data: T | null; error: { message: string } | null }> {
  let lastError: { message: string } | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await run()
    if (!error) return { data, error: null }
    lastError = error
    // '57014' es el código Postgres de "statement timeout": en el CRM externo
    // aparece de forma intermitente (carga puntual, cache frío) incluso en
    // consultas que la próxima vez responden en milisegundos. Sin este
    // reintento, un timeout puntual descartaba TODA la atribución de ventas.
    const transient = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|statement timeout|57014/i.test(error.message ?? '')
    if (!transient || attempt === maxAttempts) return { data, error }
    await new Promise((resolve) => setTimeout(resolve, attempt * 300))
  }
  return { data: null, error: lastError }
}

/**
 * El referral de una campaña puede venir anidado en distintas claves según el
 * canal (metadata, referral_metadata, referral, message_data). Estas
 * búsquedas recursivas se comparten entre crm_contact_ads y
 * crm_sales_attribution para que ambas resuelvan el mismo utm_id y, sobre
 * todo, el mismo NOMBRE de campaña en lugar de mostrarle al usuario el id.
 */
function parseMetadataValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
  try { return JSON.parse(trimmed) } catch { return value }
}

function extractUtmId(message: any): string | null {
  const parsedMessage = { ...message, metadata: parseMetadataValue(message.metadata), referral_metadata: parseMetadataValue(message.referral_metadata), referral: parseMetadataValue(message.referral), message_data: parseMetadataValue(message.message_data) }
  const candidates = [parsedMessage, parsedMessage.metadata, parsedMessage.referral_metadata, parsedMessage.referral, parsedMessage.message_data]
  const visited = new Set<object>()
  let adTitle: string | null = null
  let adSource: string | null = message.source ? String(message.source) : null
  // Campaign-level ids win over click ids (gclid/fbclid) so a Google lead
  // groups under its gad_campaignid instead of a unique per-click token.
  const idPriority = ['utm_id', 'utmid', 'utm_identifier', 'utmid_value', 'gad_campaignid', 'source_id', 'ad_id', 'ctwa_clid', 'gclid', 'gbraid', 'wbraid', 'fbclid']
  const found = new Map<string, string>()
  const find = (value: unknown) => {
    if (!value || typeof value !== 'object' || visited.has(value as object)) return
    visited.add(value as object)
    if (Array.isArray(value)) { value.forEach(find); return }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry && typeof entry === 'object') { find(entry); continue }
      const text = String(entry ?? '').trim()
      if (!text) continue
      const normalizedKey = key.toLowerCase().replace(/[\s-]+/g, '_')
      if (['ad_title', 'ad_name', 'advertisement_name', 'campaign_name', 'campaign_title'].includes(normalizedKey)) adTitle = text
      if (['source', 'platform', 'channel'].includes(normalizedKey)) adSource = text
      if (idPriority.includes(normalizedKey) && !found.has(normalizedKey)) found.set(normalizedKey, text)
    }
  }
  find(candidates)
  const id = idPriority.map((key) => found.get(key)).find(Boolean)
  if (id) return id
  // Algunos contactos de WhatsApp Ads no traen un id separado, pero sí la
  // señal de anuncio y el título que el CRM muestra en "Origen del contacto".
  if (adTitle && /facebook|meta|ctwa|ad/i.test(`${adSource ?? ''} ${message.metadata?.source_type ?? ''}`)) return adTitle
  return null
}

function extractCampaignName(message: any): string | null {
  const parsedMessage = { ...message, metadata: parseMetadataValue(message.metadata), referral_metadata: parseMetadataValue(message.referral_metadata), referral: parseMetadataValue(message.referral), message_data: parseMetadataValue(message.message_data) }
  const candidates = [parsedMessage, parsedMessage.metadata, parsedMessage.referral_metadata, parsedMessage.referral, parsedMessage.message_data]
  const visited = new Set<object>()
  // Top-level `name` is the contact's own name (e.g. "Santiago Bustos"), so a
  // bare `name` key only counts inside nested referral/campaign objects.
  const find = (value: unknown, nested: boolean): string | null => {
    if (!value || typeof value !== 'object' || visited.has(value as object)) return null
    visited.add(value as object)
    if (Array.isArray(value)) return value.map((item) => find(item, nested)).find(Boolean) ?? null
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[\s-]+/g, '_')
      const keys = ['campaign_name', 'campaignname', 'campaign', 'campaign_title', 'campaigntitle', 'utm_campaign', 'utmcampaign', 'ad_name', 'adname', 'ad_title', 'adtitle']
      if ((keys.includes(normalizedKey) || (nested && normalizedKey === 'name')) && entry != null && typeof entry !== 'object' && String(entry).trim()) return String(entry)
      const result = find(entry, true)
      if (result) return result
    }
    return null
  }
  return candidates.map((candidate, index) => find(candidate, index > 0)).find(Boolean) ?? null
}

type CrmChannel = 'google_ads' | 'meta_ads' | 'other'

// Click IDs only count when they carry a value: the CRM webhook always sends
// every key (e.g. gclid: "") so matching on the key name misclassified Meta
// leads as Google.
const CLICK_ID_CHANNEL: Record<string, CrmChannel> = {
  gclid: 'google_ads', gbraid: 'google_ads', wbraid: 'google_ads', gad_source: 'google_ads', gad_campaignid: 'google_ads',
  fbclid: 'meta_ads', fbp: 'meta_ads', fbc: 'meta_ads', _fbp: 'meta_ads', _fbc: 'meta_ads', ctwa_clid: 'meta_ads', igshid: 'meta_ads',
}
const GOOGLE_URL_PARAM = /[?&#](gclid|gbraid|wbraid|gad_source|gad_campaignid)=[^&#\s]+/i
const META_URL_PARAM = /[?&#](fbclid|_?fbp|_?fbc|fb_[a-z_]+)=[^&#\s]+/i

function clickIdChannel(key: string): CrmChannel | null {
  if (key in CLICK_ID_CHANNEL) return CLICK_ID_CHANNEL[key]
  // Any fb* parameter (fb_ad_id, fbadid, ...) is a Meta signal.
  if (/^_?fb[a-z_]*$/.test(key) && key !== 'fb') return 'meta_ads'
  return null
}
const PLATFORM_KEYS = ['source_type', 'utm_medium', 'utm_source_platform', 'platform', 'channel', 'utm_source', 'medium', 'source_app', 'source']

function normalizeCrmChannel(value: unknown): CrmChannel | null {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return null
  if (/\b(google|googleads|adwords|gads|google ads)\b/.test(text)) return 'google_ads'
  if (/\b(meta|facebook|fb|instagram|ig|whatsapp|ctwa|facebook ads)\b/.test(text)) return 'meta_ads'
  return 'other'
}

function extractCrmChannel(message: any): CrmChannel | null {
  const parsed = { ...message, metadata: parseMetadataValue(message?.metadata), referral_metadata: parseMetadataValue(message?.referral_metadata), referral: parseMetadataValue(message?.referral), message_data: parseMetadataValue(message?.message_data) }
  const clickSignals: CrmChannel[] = []
  const platformSignals: CrmChannel[] = []
  const visited = new Set<object>()
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object' || visited.has(value as object)) return
    visited.add(value as object)
    if (Array.isArray(value)) { value.forEach(walk); return }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry && typeof entry === 'object') { walk(entry); continue }
      const text = String(entry ?? '').trim()
      if (!text) continue
      const normalizedKey = key.toLowerCase().replace(/[\s-]+/g, '_')
      const clickChannel = clickIdChannel(normalizedKey)
      if (clickChannel) clickSignals.push(clickChannel)
      else if (GOOGLE_URL_PARAM.test(text)) clickSignals.push('google_ads')
      else if (META_URL_PARAM.test(text)) clickSignals.push('meta_ads')
      else if (PLATFORM_KEYS.includes(normalizedKey)) {
        const channel = normalizeCrmChannel(text)
        if (channel) platformSignals.push(channel)
      }
    }
  }
  walk(parsed)
  return clickSignals[0] ?? platformSignals.find((channel) => channel !== 'other') ?? platformSignals[0] ?? null
}

/**
 * Lee los mensajes con referral de un conjunto de contactos pasando por
 * conversations. Filtrar messages por contact_id agota el statement timeout
 * del CRM; por conversation_id responde en milisegundos.
 */
async function loadContactReferralMessages(
  crm: ReturnType<typeof createCrmClient>,
  crmAccountIds: string[],
  contactIds: string[],
  onProgress?: (done: number, total: number) => void,
) {
  const contactByConversation = new Map<string, string>()
  for (let i = 0; i < contactIds.length; i += 50) {
    const chunk = contactIds.slice(i, i + 50)
    const { data, error } = await withCrmRetry<any[]>(() => crm.from('conversations').select('id,contact_id').in('client_id', crmAccountIds).in('contact_id', chunk).limit(1000))
    if (error) throw new Error(`conversations: ${error.message}`)
    for (const row of data ?? []) contactByConversation.set(row.id, row.contact_id)
  }
  const conversationIds = [...contactByConversation.keys()]
  const messages: any[] = []
  for (let i = 0; i < conversationIds.length; i += 25) {
    const chunk = conversationIds.slice(i, i + 25)
    onProgress?.(Math.min(i + chunk.length, conversationIds.length), conversationIds.length)
    for (let offset = 0; offset < 2000; offset += 200) {
      const { data, error } = await withCrmRetry<any[]>(() => crm
        .from('messages')
        .select('id,created_at,client_id,contact_id,conversation_id,message_type,content,source,direction,metadata')
        .in('client_id', crmAccountIds)
        .in('conversation_id', chunk)
        .not('metadata->referral', 'is', null)
        .range(offset, offset + 199))
      if (error) throw new Error(`messages: ${error.message}`)
      for (const row of data ?? []) messages.push({ ...row, contact_id: row.contact_id ?? contactByConversation.get(row.conversation_id) })
      if ((data ?? []).length < 200) break
    }
  }
  return messages
}

function extractMeeting(content: unknown) {
  const text = String(content ?? '')
  if (!/Agendamiento\s*:/i.test(text)) return null
  const field = (label: string) => text.match(new RegExp(`${label}\\s*:\\s*([^\\n]*)`, 'i'))?.[1]?.trim() || null
  return { status: field('Agendamiento'), scheduled_for: field('Fecha y hora'), meeting_link: field('Link Meet') ?? field('Link'), notes: field('Notas') }
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
    if (context.analysisRunState?.accountContext) {
      console.log('[v0] get_account_context served from run cache')
      emit?.({ agentSlug: 'supervisor', toolKey: 'get_account_context', status: 'completed', label: 'Contexto de cuentas ya cargado' })
      return context.analysisRunState.accountContext
    }
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

    const result = {
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
    if (context.analysisRunState) context.analysisRunState.accountContext = result
    return result
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
  description: 'Consulta métricas reales de Meta Ads de las cuentas activas del cliente seleccionado, incluyendo gasto, leads/resultados, campañas, anuncios e IDs necesarios para cruzar utm_id o source_id del CRM.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), accountId: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string; accountId?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    if ((input.dateFrom && !input.dateTo) || (!input.dateFrom && input.dateTo)) return { available: false, message: 'Debes indicar dateFrom y dateTo juntos.' }

    const { dateFrom, dateTo } = input.dateFrom && input.dateTo ? input : defaultMetaDateRange()
    const supabase = createAdminClient()
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
  description: 'Consulta métricas reales de Google Ads de las cuentas activas del cliente seleccionado, incluyendo gasto, leads/conversiones, campañas, anuncios e IDs necesarios para cruzar utm_id o source_id del CRM. Cada cuenta incluye conversion_actions con el nombre exacto de la acción de conversión, conversiones, valor y campañas relacionadas; totals.leads es únicamente el total agregado.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), accountId: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string; accountId?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    if ((input.dateFrom && !input.dateTo) || (!input.dateFrom && input.dateTo)) return { available: false, message: 'Debes indicar dateFrom y dateTo juntos.' }
    const { dateFrom, dateTo } = input.dateFrom && input.dateTo ? input : defaultGoogleDateRange()
    const supabase = createAdminClient()
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
  description: 'Obtiene un reporte resumido de Google Analytics 4 para la propiedad del cliente: resumen, hasta 100 filas relevantes de eventos, adquisición, páginas, dispositivos, geograf��a y evolución diaria. Usala para cualquier análisis de GA4; si se necesita un detalle específico, consultá la pregunta del usuario y profundizá con la herramienta adecuada.',
  inputSchema: z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }),
  async execute(input: { dateFrom?: string; dateTo?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const argentinaRange = getBuenosAiresLastSevenDays()
    const dateTo = input.dateTo ?? argentinaRange.dateTo
    const dateFrom = input.dateFrom ?? argentinaRange.dateFrom
    const supabase = createAdminClient()
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

const getGoogleTagManagerReportTool: ToolDefinition = {
  key: 'get_google_tag_manager_report',
  description: 'Obtiene un reporte de los contenedores de Google Tag Manager del cliente: etiquetas, activadores y variables definidas por el usuario, con diagnósticos básicos (etiquetas pausadas, etiquetas sin activador, activadores sin etiquetas).',
  inputSchema: noInput,
  async execute(_input, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const supabase = createAdminClient()
    const { data: client, error } = await supabase.from('clientes').select('tag_manager_container_id').eq('id', context.clientId).single()
    if (error || !client?.tag_manager_container_id) return { available: false, message: 'El cliente no tiene un contenedor de Google Tag Manager asignado en la configuración de plataforma.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_tag_manager_report', status: 'running', label: 'Consultando Google Tag Manager...' })
    try {
      const report = await getGoogleTagManagerReport(client.tag_manager_container_id)
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_tag_manager_report', status: 'completed', label: 'Información de Google Tag Manager recibida' })
      return { available: true, source: 'Google Tag Manager', ...report }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo consultar Google Tag Manager.'
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_tag_manager_report', status: 'error', label: 'No se pudo consultar Google Tag Manager' })
      return { available: false, message }
    }
  },
}

  const getGoogleAnalyticsPageTool: ToolDefinition = {
  key: 'get_google_analytics_page_metrics',
  description: 'Consulta un conjunto amplio de métricas agregadas de una página exacta de GA4 usando pagePath: vistas, usuarios, sesiones, engagement, eventos, conversiones e ingresos cuando la propiedad los tenga disponibles. Usala para preguntas naturales sobre una URL; no requiere que el usuario conozca los nombres técnicos.',
  inputSchema: z.object({ pagePath: z.string().min(1).max(500), dateFrom: z.string().optional(), dateTo: z.string().optional() }),
  async execute(input: { pagePath: string; dateFrom?: string; dateTo?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const range = getBuenosAiresLastSevenDays()
    const dateFrom = input.dateFrom ?? range.dateFrom
    const dateTo = input.dateTo ?? range.dateTo
    const supabase = createAdminClient()
    const { data: client, error } = await supabase.from('clientes').select('analytics_property_id').eq('id', context.clientId).single()
    if (error || !client?.analytics_property_id) return { available: false, message: 'El cliente no tiene una propiedad de Google Analytics 4 asignada en la configuración de plataforma.' }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_page_metrics', status: 'running', label: `Consultando métricas de ${input.pagePath} en GA4...` })
    try {
      const result = await getGoogleAnalyticsPageMetrics(client.analytics_property_id, dateFrom, dateTo, input.pagePath)
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_page_metrics', status: 'completed', label: `Métricas de ${input.pagePath} recibidas` })
      return { available: true, source: 'Google Analytics 4', timeZone: range.timeZone, ...result }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudieron consultar las métricas de la página en Google Analytics 4.'
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_google_analytics_page_metrics', status: 'error', label: 'No se pudieron consultar las métricas de la página' })
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
    const supabase = createAdminClient()
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
  description: 'Lista oportunidades del CRM dentro de un período, incluyendo estado, etapa, vendedor, contacto y monto. Para ventas, pasá status=won y usá los contact_id devueltos para el siguiente cruce.',
  inputSchema: z.object({ dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.string().optional() }),
  async execute(input: { dateFrom: string; dateTo: string; status?: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const crmAccountIds = await resolveCrmAccountIds(context.clientId)
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de CRM vinculada.' }
    const crm = createCrmClient()
    const start = new Date(`${input.dateFrom}T00:00:00-03:00`).toISOString()
    const endExclusive = new Date(`${input.dateTo}T00:00:00-03:00`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const end = endExclusive.toISOString()
    const opportunities: any[] = []
    try {
      for (let offset = 0; offset < 10000; offset += 100) {
        let query = crm.from('opportunities').select('id,created_at,client_id,contact_id,pipeline_id,stage_id,assigned_user,status,conversation_id,assigned_team_id,assigned_type,amount,currency').in('client_id', crmAccountIds).gte('created_at', start).lt('created_at', end)
        if (input.status) query = query.eq('status', input.status)
        const { data, error } = await withCrmRetry(() => query.range(offset, offset + 99))
        if (error) throw new Error(`opportunities: ${error.message}`)
        opportunities.push(...(data ?? []))
        if ((data ?? []).length < 100) break
      }
      const contactIds = [...new Set(opportunities.map(row => row.contact_id).filter(Boolean))]
      const pipelineIds = [...new Set(opportunities.map(row => row.pipeline_id).filter(Boolean))]
      const [contactsResult, stagesResult] = await Promise.all([
        contactIds.length ? withCrmRetry(() => crm.from('contacts').select('id,name,email,phone').in('client_id', crmAccountIds).in('id', contactIds)) : Promise.resolve({ data: [], error: null }),
        pipelineIds.length ? withCrmRetry(() => crm.from('pipeline_stages').select('id,pipeline_id,name,description').in('client_id', crmAccountIds).in('pipeline_id', pipelineIds)) : Promise.resolve({ data: [], error: null }),
      ])
      const contactsById = new Map((contactsResult.data ?? []).map(row => [row.id, row]))
      const stagesById = new Map((stagesResult.data ?? []).map(row => [row.id, row]))
      const rows = opportunities.map(opportunity => ({ ...opportunity, contact: contactsById.get(opportunity.contact_id) ?? null, stage: stagesById.get(opportunity.stage_id) ?? null }))
      const byStatus = rows.reduce<Record<string, number>>((summary, row) => { const status = String(row.status ?? 'sin_estado'); summary[status] = (summary[status] ?? 0) + 1; return summary }, {})
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_opportunities', status: 'completed', label: `${rows.length} oportunidades consultadas` })
      return { available: true, period: { date_from: input.dateFrom, date_to: input.dateTo, timezone: 'America/Argentina/Buenos_Aires', query_start_utc: start, query_end_exclusive_utc: end }, totals: { opportunities: rows.length, by_status: byStatus, amount: rows.reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0) }, opportunities: rows.slice(0, 500), truncated: rows.length > 500 }
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_opportunities', status: 'error', label: 'No se pudieron consultar las oportunidades' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar CRM.' }
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
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de CRM vinculada.' }
    const crm = createCrmClient()
    const start = new Date(`${input.dateFrom}T00:00:00-03:00`).toISOString()
    const endExclusive = new Date(`${input.dateTo}T00:00:00-03:00`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const end = endExclusive.toISOString()
    const contacts: any[] = []
    try {
      for (let offset = 0; offset < 10000; offset += 100) {
        const { data, error } = await withCrmRetry(() => crm.from('contacts').select('id,created_at,client_id,name,email,phone').in('client_id', crmAccountIds).gte('created_at', start).lt('created_at', end).range(offset, offset + 99))
        if (error) throw new Error(`contacts: ${error.message}`)
        contacts.push(...(data ?? []))
        if ((data ?? []).length < 100) break
      }
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_contacts', status: 'completed', label: `${contacts.length} contactos consultados` })
      return { available: true, period: { date_from: input.dateFrom, date_to: input.dateTo, timezone: 'America/Argentina/Buenos_Aires', query_start_utc: start, query_end_exclusive_utc: end }, totals: { contacts: contacts.length }, contacts: contacts.slice(0, 500), truncated: contacts.length > 500 }
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_contacts', status: 'error', label: 'No se pudieron consultar los contactos' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar CRM.' }
    }
  },
}

const crmContactAds: ToolDefinition = {
  key: 'crm_contact_ads',
  description: 'Cuenta leads/contactos CRM creados en el período y los agrupa por la campaña o anuncio que figura en la atribución del CRM. Lee utm_id, source_id, ctwa_clid, ad_id y metadata visible del origen (incluyendo título del anuncio). Si ya obtuviste oportunidades won, pasá sus contactIds para cruzar únicamente esos contactos; si no, analiza todos los contactos creados en el período.',
  inputSchema: z.object({ dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), contactIds: z.array(z.string()).optional() }),
  async execute(input: { dateFrom: string; dateTo: string; contactIds?: string[] }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const crmAccountIds = await resolveCrmAccountIds(context.clientId)
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de CRM vinculada.' }
    const crm = createCrmClient()
    const start = new Date(`${input.dateFrom}T00:00:00-03:00`).toISOString()
    const endExclusive = new Date(`${input.dateTo}T00:00:00-03:00`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const end = endExclusive.toISOString()
    const getAdId = extractUtmId
    const getCampaign = extractCampaignName
    try {
      const contacts: any[] = []
      for (let offset = 0; offset < 10000; offset += 100) {
        let query = crm.from('contacts').select('id,created_at,client_id,name,email,phone').in('client_id', crmAccountIds).gte('created_at', start).lt('created_at', end)
        if (input.contactIds?.length) query = query.in('id', input.contactIds)
        const { data, error } = await withCrmRetry(() => query.range(offset, offset + 99))
        if (error) throw new Error(`contacts: ${error.message}`)
        contacts.push(...(data ?? []))
        if ((data ?? []).length < 100) break
      }
      const contactIds = contacts.map(contact => contact.id).filter(Boolean)
      const messages = await loadContactReferralMessages(crm, crmAccountIds, contactIds, (done, total) =>
        context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_contact_ads', status: 'running', label: `Leyendo origen de contactos (${done}/${total} conversaciones)...` }))
      const referralsByContact = new Map<string, any[]>()
      const getReferral = (message: any) => {
        const metadata = parseMetadataValue(message.metadata)
        const referralMetadata = parseMetadataValue(message.referral_metadata)
        const messageData = parseMetadataValue(message.message_data)
        const candidates = [
          (metadata as any)?.referral,
          metadata,
          referralMetadata,
          messageData,
        ]
        return candidates.find((value) => value && typeof value === 'object') ?? null
      }
      for (const message of messages) {
        const utmId = getAdId(message)
        if (!utmId || !message.contact_id) continue
        const rows = referralsByContact.get(message.contact_id) ?? []
        rows.push({
          referral: getReferral(message),
          utm_id: String(utmId),
          campaign: getCampaign(message),
          channel: extractCrmChannel(message),
          source_id: getReferral(message)?.source_id ?? null,
          message_id: message.id,
          conversation_id: message.conversation_id,
          created_at: message.created_at,
          source: message.source,
          direction: message.direction,
          content: message.content,
          metadata: message.metadata,
          referral_metadata: message.referral_metadata ?? null,
          referral_source: getReferral(message)?.source ?? getReferral(message)?.source_id ?? null,
          referral_ad_id: getReferral(message)?.ad_id ?? getReferral(message)?.source_id ?? null,
          referral_ad_title: getReferral(message)?.ad_title ?? getReferral(message)?.campaign_name ?? null,
        })
        referralsByContact.set(message.contact_id, rows)
      }
      const attributedContacts = contacts.filter(contact => referralsByContact.has(contact.id)).map(contact => ({ ...contact, referrals: referralsByContact.get(contact.id) }))
      const campaignSummary = new Map<string, { campaign: string; contacts: Set<string>; utm_ids: Set<string> }>()
      for (const contact of attributedContacts) {
        for (const referral of referralsByContact.get(contact.id) ?? []) {
          const campaign = referral.campaign ?? `UTM ID ${referral.utm_id}`
          const current = campaignSummary.get(campaign) ?? { campaign, contacts: new Set<string>(), utm_ids: new Set<string>() }
          current.contacts.add(contact.id)
          current.utm_ids.add(referral.utm_id)
          campaignSummary.set(campaign, current)
        }
      }
      const campaigns = [...campaignSummary.values()].map(item => ({ campaign: item.campaign, contacts: item.contacts.size, utm_ids: [...item.utm_ids] })).sort((a, b) => b.contacts - a.contacts)
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_contact_ads', status: 'completed', label: `${attributedContacts.length} contactos de pauta` })
      return {
        available: true,
        period: { date_from: input.dateFrom, date_to: input.dateTo, timezone: 'America/Argentina/Buenos_Aires', query_start_utc: start, query_end_exclusive_utc: end },
        totals: { contacts_created: contacts.length, contacts_with_ad_referral: attributedContacts.length, messages_scanned: messages.length, campaigns: campaigns.length },
        campaigns,
        contacts: attributedContacts,
        referral_context: attributedContacts.flatMap(contact => (contact.referrals ?? []).map((referral: any) => ({ contact_id: contact.id, contact_name: contact.name, ...referral }))),
        truncated: false,
      }
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_contact_ads', status: 'error', label: 'No se pudo analizar la pauta de contactos' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar la atribución de contactos en CRM.' }
    }
  },
}

const crmSalesAttribution: ToolDefinition = {
  key: 'crm_sales_attribution',
  description: 'Relaciona oportunidades ganadas del CRM con contactos y mensajes inbound con utm_id/referral/source_id para atribución de ventas. Usala después de identificar las oportunidades won cuando la consulta pide ventas por campaña o anuncio. by_campaign.campaign es el NOMBRE de campaña resuelto: usá siempre ese campo para mostrarle la campaña al usuario, nunca el utm_id/ad_id (que solo sirve como referencia interna). by_channel es el resumen canónico de ventas CRM por canal y debe usarse literalmente para comparar Google Ads, Meta Ads y sin atribución. El canal ya se resuelve por click ID: gclid/gbraid/wbraid/gad_* = Google Ads; fbclid/fbp/fbc o cualquier parámetro fb* = Meta Ads. Si una venta de google_ads figura como "UTM ID <número>", ese número es el gad_campaignid: resolvé el nombre de la campaña con get_google_metrics por ID antes de responder, sin preguntar. Su resultado es evidencia CRM; debe cruzarse con Meta Ads o Google Ads para validar gasto, leads y nombres de campaña. NO usar para contar el total de contactos creados: para eso usar crm_contacts.',
  inputSchema: z.object({ dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  async execute(input: { dateFrom: string; dateTo: string }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const crmAccountIds = await resolveCrmAccountIds(context.clientId)
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de CRM vinculada.' }
    const crm = createCrmClient()
    const start = `${input.dateFrom}T00:00:00.000Z`
    const end = `${input.dateTo}T23:59:59.999Z`
    const batch = async (table: string, columns: string, filters: (query: any) => any, maxRows = 2000) => {
      const rows: any[] = []
      for (let offset = 0; offset < maxRows; offset += 100) {
        let query = filters(crm.from(table).select(columns))
        const { data, error } = await withCrmRetry<any[]>(() => query.range(offset, offset + 99))
        if (error) throw new Error(`${table}: ${error.message}`)
        rows.push(...(data ?? []))
        if ((data ?? []).length < 100) break
      }
      return rows
    }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'running', label: 'Analizando ventas y atribución del CRM...' })
    try {
      // La herramienta solo necesita ventas ganadas. Filtrar en el CRM evita
      // traer y enriquecer cientos/miles de oportunidades abiertas o perdidas
      // que no pueden aparecer en el resultado y eran la causa principal de
      // los timeouts del multiagente.
      const opportunities = await batch('opportunities', 'id,created_at,client_id,contact_id,pipeline_id,stage_id,assigned_user,status,conversation_id,assigned_team_id,assigned_type,amount,currency', query => query.in('client_id', crmAccountIds).in('status', ['won', 'ganado']).gte('created_at', start).lte('created_at', end), 5000)
      const contactIds = [...new Set(opportunities.map(row => row.contact_id).filter(Boolean))]
      const pipelineIds = [...new Set(opportunities.map(row => row.pipeline_id).filter(Boolean))]
      // Las conversaciones no son necesarias para determinar una venta WON ni
      // para atribuirla por UTM. No hacemos esta consulta porque una falla del
      // endpoint conversations no debe invalidar todas las ventas.
      // Primero consultamos contactos: normalmente ya contienen el referral
      // y así evitamos recorrer todo el historial de mensajes del CRM.
      // Los mensajes se consultan únicamente para contactos sin atribución.
      const contacts: any[] = []
      for (let i = 0; i < contactIds.length; i += 25) {
        const chunk = contactIds.slice(i, i + 25)
        context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'running', label: `Consultando contactos CRM (${Math.min(i + chunk.length, contactIds.length)}/${contactIds.length})...` })
        const rows = await batch('contacts', 'id,client_id,name,email,phone,metadata,custom_fields', query => query.in('client_id', crmAccountIds).in('id', chunk), 100).catch(() => [])
        contacts.push(...rows)
      }
      const contactReferralIds = new Set(contacts.filter((contact) => extractCampaignName(contact) || extractUtmId(contact)).map((contact) => contact.id))
      const missingReferralIds = contactIds.filter((id) => !contactReferralIds.has(id))
      const messages = missingReferralIds.length
        ? await loadContactReferralMessages(crm, crmAccountIds, missingReferralIds, (done, total) =>
          context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'running', label: `Buscando atribución en mensajes (${done}/${total} conversaciones)...` }))
        : []
      const stages = pipelineIds.length
        ? await batch('pipeline_stages', 'id,client_id,pipeline_id,name,description', query => query.in('client_id', crmAccountIds).in('pipeline_id', pipelineIds))
        : []
      const contactsById = new Map(contacts.map((row: any) => [row.id, row]))
      const stagesById = new Map(stages.map((row: any) => [row.id, row]))
      const referralsByContact = new Map<string, any>()
      // En el panel del CRM la atribución visible pertenece al contacto
      // (origen, ctwa_ad, título e ID del anuncio), no necesariamente a un
      // mensaje inbound. Priorizar esta fuente evita perder las ventas cuando
      // el endpoint de mensajes no devuelve metadata.
      for (const contact of contacts) {
        const campaign = extractCampaignName(contact)
        const adId = extractUtmId(contact)
        if (contact.id && (campaign || adId)) {
          referralsByContact.set(contact.id, { ...contact, ad_id: adId, ad_title: campaign, channel: extractCrmChannel(contact), campaign: campaign ?? (adId ? `UTM ID ${adId}` : null) })
        }
      }
      for (const message of messages) {
        const metadata = parseMetadataValue(message.metadata) as any
        const referral = metadata?.referral ?? metadata
        if (message.contact_id && referral && typeof referral === 'object' && !referralsByContact.has(message.contact_id)) {
          // Buscamos el utm_id y el NOMBRE de campaña con la misma búsqueda
          // recursiva que usa crm_contact_ads: el nombre suele venir anidado
          // más adentro del metadata que el ad_title/campaign_name de nivel
          // superior, y sin esto el usuario terminaba viendo el utm_id.
          const adId = extractUtmId(message) ?? referral.source_id ?? referral.ad_id ?? null
          const campaignName = extractCampaignName(message)
          referralsByContact.set(message.contact_id, { ...message, referral, ad_id: adId, ad_title: campaignName, channel: extractCrmChannel(message), campaign: campaignName ?? (adId ? `UTM ID ${adId}` : null) })
        }
      }
      const won = opportunities.filter(row => String(row.status ?? '').toLowerCase() === 'won' || String(row.status ?? '').toLowerCase() === 'ganado')
      const attributed = won.map(opportunity => {
        const referral = referralsByContact.get(opportunity.contact_id)
        return { opportunity, contact: contactsById.get(opportunity.contact_id) ?? null, stage: stagesById.get(opportunity.stage_id) ?? null, referral: referral ?? null }
      })
      // Se agrupa por NOMBRE de campaña (no por utm_id) para que el usuario
      // vea "Campaña X" en vez de un identificador. Cuando no hay nombre
      // resuelto, mostramos "UTM ID {id}" como último recurso en lugar de
      // dejar la fila vacía.
      const byCampaign = new Map<string, any>()
      for (const sale of attributed) {
        const key = sale.referral?.campaign ?? 'unattributed'
        const current = byCampaign.get(key) ?? { campaign: key === 'unattributed' ? null : key, ad_id: key === 'unattributed' ? null : sale.referral?.ad_id ?? null, sales: 0, amount: 0 }
        current.sales += 1
        current.amount += Number(sale.opportunity.amount ?? 0) || 0
        byCampaign.set(key, current)
      }
      const byChannel = new Map<string, { channel: string; sales: number; amount: number; campaign_sales: number }>()
      for (const sale of attributed) {
        const channel = sale.referral?.channel ?? 'unattributed'
        const current = byChannel.get(channel) ?? { channel, sales: 0, amount: 0, campaign_sales: 0 }
        current.sales += 1
        current.amount += Number(sale.opportunity.amount ?? 0) || 0
        if (sale.referral?.campaign) current.campaign_sales += 1
        byChannel.set(channel, current)
      }
      const result = { available: true, period: { date_from: input.dateFrom, date_to: input.dateTo }, totals: { won_sales: won.length, attributed_sales: attributed.filter(sale => sale.referral?.channel).length, unattributed_sales: attributed.filter(sale => !sale.referral?.channel).length, amount: won.reduce((sum, row) => sum + (Number(row.amount ?? 0) || 0), 0) }, by_channel: [...byChannel.values()].sort((a, b) => b.sales - a.sales), by_campaign: [...byCampaign.values()].sort((a, b) => b.sales - a.sales), sales: attributed.slice(0, 100), truncated: attributed.length > 100 }
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'completed', label: `${won.length} ventas ganadas analizadas` })
      return result
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_sales_attribution', status: 'error', label: 'No se pudo analizar el CRM' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudo consultar CRM.' }
    }
  },
}

const crmAppointments: ToolDefinition = {
  key: 'crm_appointments',
  description: 'Lista las agendas/reuniones cargadas en el CRM (contactos con etiqueta tipo "Agendó reunión" / "Reunión agendada") en un período, con fecha y estado de la reunión, y YA CRUZADAS con su origen: canal (Meta Ads/Google Ads/otro), campaña (utm_campaign), utm_source/utm_medium y utm_id/ad_id. Usala para cualquier pregunta sobre agendas, reuniones, demos o turnos agendados, y para el detalle de campañas de esas agendas. dateBasis=tagged filtra por la fecha en que se agendó (default); dateBasis=meeting filtra por la fecha de la reunión.',
  inputSchema: z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateBasis: z.enum(['tagged', 'meeting']).default('tagged'),
  }),
  async execute(input: { dateFrom: string; dateTo: string; dateBasis?: 'tagged' | 'meeting' }, context: ExecutionContext) {
    if (!context.clientId) return { available: false, message: 'No hay un cliente activo seleccionado.' }
    const crmAccountIds = await resolveCrmAccountIds(context.clientId)
    if (crmAccountIds.length === 0) return { available: false, message: 'El cliente activo no tiene ninguna cuenta de CRM vinculada.' }
    const crm = createCrmClient()
    const start = new Date(`${input.dateFrom}T00:00:00-03:00`)
    const endExclusive = new Date(`${input.dateTo}T00:00:00-03:00`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const basis = input.dateBasis ?? 'tagged'
    const inPeriod = (value: string | null | undefined) => {
      const time = value ? new Date(value).getTime() : NaN
      return Number.isFinite(time) && time >= start.getTime() && time < endExclusive.getTime()
    }
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_appointments', status: 'running', label: 'Buscando agendas en el CRM...' })
    try {
      const { data: tags, error: tagsError } = await withCrmRetry<any[]>(() => crm.from('tags').select('id,client_id,name').in('client_id', crmAccountIds))
      if (tagsError) throw new Error(`tags: ${tagsError.message}`)
      const agendaTags = (tags ?? []).filter((tag) => /agend|reuni[oó]n|meeting|demo|turno/i.test(String(tag.name ?? '')))
      if (agendaTags.length === 0) return { available: true, period: { date_from: input.dateFrom, date_to: input.dateTo, timezone: 'America/Argentina/Buenos_Aires' }, agenda_tags: [], totals: { appointments: 0 }, message: 'El CRM no tiene etiquetas de agenda/reunión para este cliente.' }
      const tagNames = new Map(agendaTags.map((tag) => [tag.id, tag.name]))
      const contactTags: any[] = []
      for (let offset = 0; offset < 10000; offset += 500) {
        let query = crm.from('contact_tags').select('contact_id,tag_id,created_at').in('tag_id', [...tagNames.keys()])
        if (basis === 'tagged') query = query.gte('created_at', start.toISOString()).lt('created_at', endExclusive.toISOString())
        const { data, error } = await withCrmRetry<any[]>(() => query.range(offset, offset + 499))
        if (error) throw new Error(`contact_tags: ${error.message}`)
        contactTags.push(...(data ?? []))
        if ((data ?? []).length < 500) break
      }
      const taggedByContact = new Map<string, any>()
      for (const row of contactTags) if (!taggedByContact.has(row.contact_id)) taggedByContact.set(row.contact_id, row)
      const contactIds = [...taggedByContact.keys()]
      const contacts: any[] = []
      for (let i = 0; i < contactIds.length; i += 100) {
        const { data, error } = await withCrmRetry<any[]>(() => crm.from('contacts').select('id,name,email,phone,created_at').in('client_id', crmAccountIds).in('id', contactIds.slice(i, i + 100)))
        if (error) throw new Error(`contacts: ${error.message}`)
        contacts.push(...(data ?? []))
      }
      const messages = await loadContactReferralMessages(crm, crmAccountIds, contacts.map((contact) => contact.id), (done, total) =>
        context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_appointments', status: 'running', label: `Cruzando agendas con su origen (${done}/${total} conversaciones)...` }))
      const messagesByContact = new Map<string, any[]>()
      for (const message of messages) {
        const rows = messagesByContact.get(message.contact_id) ?? []
        rows.push(message)
        messagesByContact.set(message.contact_id, rows)
      }
      const appointments = contacts.map((contact) => {
        const rows = (messagesByContact.get(contact.id) ?? []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        const meetingMessage = rows.find((row) => extractMeeting(row.content))
        const referralMessage = meetingMessage ?? rows[0] ?? null
        const referral = (parseMetadataValue(referralMessage?.metadata) as any)?.referral ?? null
        const tagged = taggedByContact.get(contact.id)
        return {
          contact_id: contact.id,
          contact_name: contact.name,
          tag: tagNames.get(tagged?.tag_id) ?? null,
          tagged_at: tagged?.created_at ?? null,
          meeting: meetingMessage ? extractMeeting(meetingMessage.content) : null,
          channel: referralMessage ? extractCrmChannel(referralMessage) : null,
          campaign: referralMessage ? extractCampaignName(referralMessage) : null,
          utm_source: referral?.utm_source || null,
          utm_medium: referral?.utm_medium || referral?.source_type || null,
          utm_id: referralMessage ? extractUtmId(referralMessage) : null,
          ad_id: referral?.ad_id || referral?.utm_content || null,
          landing_url: referral?.source_url || referral?.utm_url || null,
        }
      }).filter((row) => basis === 'tagged' || inPeriod(row.meeting?.scheduled_for))
      const summarize = (key: 'channel' | 'campaign') => {
        const map = new Map<string, { value: string | null; appointments: number; confirmed: number }>()
        for (const row of appointments) {
          const value = row[key] ?? null
          const current = map.get(value ?? 'unattributed') ?? { value, appointments: 0, confirmed: 0 }
          current.appointments += 1
          if (/confirm/i.test(row.meeting?.status ?? '')) current.confirmed += 1
          map.set(value ?? 'unattributed', current)
        }
        return [...map.values()].sort((a, b) => b.appointments - a.appointments)
      }
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_appointments', status: 'completed', label: `${appointments.length} agendas encontradas` })
      return {
        available: true,
        period: { date_from: input.dateFrom, date_to: input.dateTo, timezone: 'America/Argentina/Buenos_Aires', date_basis: basis },
        agenda_tags: agendaTags.map((tag) => tag.name),
        totals: {
          appointments: appointments.length,
          with_meeting_details: appointments.filter((row) => row.meeting).length,
          confirmed: appointments.filter((row) => /confirm/i.test(row.meeting?.status ?? '')).length,
          with_campaign: appointments.filter((row) => row.campaign).length,
          without_attribution: appointments.filter((row) => !row.channel && !row.campaign).length,
        },
        by_channel: summarize('channel').map(({ value, ...rest }) => ({ channel: value ?? 'unattributed', ...rest })),
        by_campaign: summarize('campaign').map(({ value, ...rest }) => ({ campaign: value, ...rest })),
        appointments: appointments.slice(0, 200),
        truncated: appointments.length > 200,
      }
    } catch (error) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'crm_appointments', status: 'error', label: 'No se pudieron consultar las agendas' })
      return { available: false, message: error instanceof Error ? error.message : 'No se pudieron consultar las agendas del CRM.' }
    }
  },
}

type ReportPeriod = { dateFrom: string; dateTo: string }

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

function lastClosedMonth(): ReportPeriod {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  return { dateFrom: isoDate(start), dateTo: isoDate(end) }
}

function previousPeriod({ dateFrom, dateTo }: ReportPeriod): ReportPeriod {
  const from = new Date(`${dateFrom}T00:00:00Z`)
  const to = new Date(`${dateTo}T00:00:00Z`)
  const monthEnd = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0))
  const isFullMonth = from.getUTCDate() === 1 && to.getUTCDate() === monthEnd.getUTCDate() && from.getUTCMonth() === to.getUTCMonth()
  if (isFullMonth) {
    return {
      dateFrom: isoDate(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1))),
      dateTo: isoDate(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0))),
    }
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  const prevTo = new Date(from); prevTo.setUTCDate(prevTo.getUTCDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1)
  return { dateFrom: isoDate(prevFrom), dateTo: isoDate(prevTo) }
}

// Solo totales y campañas: los anuncios y ad groups inflan el payload y el
// prompt de Claude Design trabaja a nivel campaña.
function compactPlatformMetrics(result: unknown) {
  if (!result || typeof result !== 'object') return result
  const record = result as Record<string, any>
  if (!Array.isArray(record.accounts)) return record
  return {
    available: record.available,
    date_range: record.date_range,
    totals_by_currency: record.totals_by_currency,
    errors: record.errors,
    accounts: record.accounts.map((account: Record<string, any>) => ({
      account_id: account.account_id,
      account_name: account.account_name,
      moneda: account.moneda,
      totals: account.totals,
      campaigns: Array.isArray(account.campaigns)
        ? [...account.campaigns]
            .sort((a, b) => Number(b?.spend ?? b?.cost ?? 0) - Number(a?.spend ?? a?.cost ?? 0))
            .slice(0, 25)
            .map(({ ads, ad_sets, ad_groups, ...campaign }: Record<string, any>) => campaign)
        : [],
    })),
  }
}

function compactCrmResult(result: unknown, keep: string[]) {
  if (!result || typeof result !== 'object') return result
  const record = result as Record<string, any>
  const compact: Record<string, unknown> = {}
  for (const key of ['available', 'message', 'period', 'total', 'count', 'totals', 'summary', ...keep]) {
    if (key in record) compact[key] = record[key]
  }
  return compact
}

async function collectReportData(plan: ReportPlan, period: ReportPeriod, previous: ReportPeriod, context: ExecutionContext) {
  const run = async (definition: ToolDefinition, input: Record<string, unknown>) => {
    try {
      return await definition.execute(input, context)
    } catch (error) {
      console.error(`[v0] report data ${definition.key} failed:`, error)
      return { available: false, message: `No se pudo consultar ${definition.key}.` }
    }
  }
  const [meta, google, metaPrevious, googlePrevious, sales, contacts, opportunities, changes, benchmark] = await Promise.all([
    run(getMetaMetrics, period),
    run(getGoogleMetrics, period),
    run(getMetaMetrics, previous),
    run(getGoogleMetrics, previous),
    run(crmSalesAttribution, period),
    run(crmContacts, period),
    run(crmOpportunities, period),
    run(getAccountChangeHistory, { platform: null, dateFrom: period.dateFrom, dateTo: period.dateTo, accountId: null, entityType: null, entityId: null, sourceEventIds: null, fieldCategories: null, actorEmail: null, limit: 60 }),
    plan === 'estrategico' ? run(getIndustryBenchmark, {}) : Promise.resolve(null),
  ])
  return {
    meta: compactPlatformMetrics(meta),
    google: compactPlatformMetrics(google),
    meta_previous: compactPlatformMetrics(metaPrevious),
    google_previous: compactPlatformMetrics(googlePrevious),
    crm_sales_attribution: compactCrmResult(sales, ['by_channel', 'by_campaign', 'total_sales', 'attributed', 'unattributed']),
    crm_contacts: compactCrmResult(contacts, ['total_contacts', 'by_source', 'by_channel', 'by_day']),
    crm_opportunities: compactCrmResult(opportunities, ['total_opportunities', 'by_status', 'by_stage', 'won', 'won_count']),
    change_history: changes && typeof changes === 'object'
      ? { available: (changes as any).available, events: ((changes as any).events ?? []).slice(0, 60).map((event: any) => ({ platform: event.platform, occurred_at: event.occurred_at, actor_name: event.actor_name, entity_type: event.entity_type, entity_name: event.entity_name, operation: event.operation, field_categories: event.field_categories })) }
      : changes,
    ...(benchmark ? { industry_benchmark: benchmark } : {}),
  }
}

const getClaudeDesignPrompt: ToolDefinition = {
  key: 'get_claude_design_prompt',
  description: 'Devuelve la estructura del prompt para Claude Design adaptada al plan del cliente activo (Esencial o Estratégico) JUNTO con todas las métricas reales del período (Meta, Google, período anterior, ventas/atribución CRM, contactos CRM, oportunidades e historial de cambios) en report_data. Pasá dateFrom/dateTo del período pedido. Usala cuando el usuario pida el prompt para Claude Design o acepte recibirlo; no hace falta consultar las métricas antes.',
  inputSchema: z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Inicio del período del informe (YYYY-MM-DD). Si no se indica, se usa el último mes cerrado.'),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fin del período del informe (YYYY-MM-DD).'),
    plan_override: z.enum(['esencial', 'estrategico']).optional().describe('Solo si el usuario pidió explícitamente otro plan o el cliente no tiene plan cargado.'),
  }),
  async execute(input: { dateFrom?: string; dateTo?: string; plan_override?: ReportPlan }, context: ExecutionContext) {
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_claude_design_prompt', status: 'running', label: 'Preparando prompt para Claude Design...' })
    let rawPlan: unknown = null
    if (context.clientId) {
      const supabase = await createClient()
      const { data, error } = await supabase.from('clientes').select('plan').eq('id', context.clientId).maybeSingle()
      if (error) console.error('[v0] get_claude_design_prompt plan lookup failed:', error.message)
      rawPlan = data?.plan ?? null
    }
    const plan = input.plan_override ?? normalizeReportPlan(rawPlan)
    if (!plan) {
      context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_claude_design_prompt', status: 'completed', label: 'Falta definir la plantilla' })
      return {
        available: false,
        client_plan: rawPlan,
        message: 'El cliente no tiene un plan Esencial o Estratégico cargado. Preguntale al usuario cuál de las dos plantillas usar.',
      }
    }
    const period = input.dateFrom && input.dateTo ? { dateFrom: input.dateFrom, dateTo: input.dateTo } : lastClosedMonth()
    const previous = previousPeriod(period)
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_claude_design_prompt', status: 'running', label: `Consultando métricas del ${period.dateFrom} al ${period.dateTo}...` })
    const reportData = await collectReportData(plan, period, previous, context)
    context.emitActivity?.({ agentSlug: 'supervisor', toolKey: 'get_claude_design_prompt', status: 'completed', label: 'Prompt de Claude Design listo' })
    return {
      available: true,
      client_plan: rawPlan,
      client_name: context.metadata?.clientName ?? null,
      period,
      previous_period: previous,
      report_data: reportData,
      ...buildClaudeDesignBrief(plan),
      fill_rules: [
        'Arm�� el prompt final en un único bloque de código markdown listo para copiar y pegar en Claude Design.',
        'Empezá con design_header, luego "# document_title" y "## plan_label — [Cliente]" con Cliente (client_name), Período (period) y Responsable/Ejecutivo.',
        'report_data YA trae las métricas reales consultadas para este cliente: meta y google (período actual con totales y campañas), meta_previous y google_previous (período anterior para el "vs. anterior"), crm_sales_attribution (ventas y by_channel/by_campaign), crm_contacts (leads en CRM), crm_opportunities y change_history. Usalas para completar TODAS las cifras. No vuelvas a llamar a esas herramientas y no digas que falta generar el informe.',
        'Tabla por campaña: una fila por cada campaña con inversión > 0 de report_data.meta y report_data.google (agrupá en "Otras N campañas" las de inversión insignificante), con Inversión, Leads, CPL (inversión/leads) y Vs. anterior (CPL de la misma campaña en *_previous, o "nueva" si no existía). Agregá fila TOTAL.',
        'Acciones realizadas / optimizaciones: derivalas de report_data.change_history (qué se cambió, cuándo y en qué campaña). Solo dejá PENDIENTE si change_history no trae eventos.',
        'Objetivo de pauta y métricas objetivo: si no hay objetivo cargado, usá el resultado del período anterior como referencia y aclaralo con una NOTA PARA DISEÑO.',
        'Completá cada slide en orden con los números reales (inversión, leads, CPL, CPC, CTR, ventas, atribución, % vs anterior, filas TOTAL). Cada tabla debe tener todas sus filas y columnas con valores.',
        'Entregá el prompt COMPLETO y visible en esta misma respuesta, antes de cualquier pregunta de confirmación: todas las slides de la plantilla, sin resumir, sin cortar y sin "etc.". No digas solamente que está listo ni lo reemplaces por un botón. Nunca pidas permiso para continuar.',
        'Solo usá "⟶ PENDIENTE" para campos cualitativos que dependen del equipo (acciones realizadas, tests, requerimientos) o cuando la herramienta devolvió sin datos; en ese caso indicá la causa y sumalo al resumen de pendientes. Nunca inventes datos.',
        'Agregá "⟶ NOTA PARA DISEÑO" cuando un dato necesite contexto (campaña nueva sin comparación, volumen muy bajo, cuenta sin CRM, etc.).',
        'Cerrá con closing_sections.',
      ],
    }
  },
}

const allTools: ToolDefinition[] = [
  getClaudeDesignPrompt,
  crmAppointments,
  crmOpportunities,
  crmContacts,
  crmContactAds,
  crmSalesAttribution,
  getAccountContext,
  getCrmContext,
  getClientMemory,
  saveClientProfile,
  getIndustryBenchmark,
  getMetaMetrics,
  getGoogleMetrics,
  getGoogleAnalyticsReportTool,
  getGoogleAnalyticsPageTool,
  getGoogleAnalyticsSalesTool,
  getGoogleTagManagerReportTool,
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
