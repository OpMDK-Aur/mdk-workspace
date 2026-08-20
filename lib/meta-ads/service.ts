export interface MetaAction {
  action_type: string
  value: string
}

export interface MetaAccountMetricsInput {
  accountId: string
  accountName?: string | null
  moneda?: string | null
  zonaHoraria?: string | null
  dateFrom: string
  dateTo: string
  onlyActiveCampaigns?: boolean
}

export type MetaErrorCategory =
  | 'AUTHENTICATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'ACCOUNT_ERROR'
  | 'RATE_LIMIT'
  | 'API_ERROR'
  | 'UNKNOWN_ERROR'

export interface MetaServiceError extends Error {
  category: MetaErrorCategory
  code?: number
  httpStatus?: number
}

export interface MetaCampaignMetrics {
  id: string
  name: string
  objective: string
  impressions: number
  clicks: number
  spend: number
  results: number
  result_type: MetaResultType
  source_action_type: string | null
  ctr: number
  cpc: number
  cost_per_result: number
  // Legacy aliases used by /api/ads/meta.
  leads: number
  cpl: number
  lead_type: string
}

export interface MetaAccountMetrics {
  account_id: string
  account_name: string | null
  moneda: string | null
  zona_horaria: string | null
  date_range: { start: string; end: string }
  totals: {
    impressions: number
    clicks: number
    spend: number
    results: number
    ctr: number
    cpc: number
    cost_per_result: number
    leads: number
    cpl: number
  }
  results_by_type: Record<string, { results: number; spend: number; cost_per_result: number }>
  campaigns: MetaCampaignMetrics[]
}

export type MetaResultType =
  | 'lead'
  | 'messaging_conversation'
  | 'contact'
  | 'application'
  | 'registration'
  | 'link_click'
  | 'landing_page_view'
  | 'engagement'
  | 'video_view'
  | 'other'

interface MetaInsightRow {
  campaign_id?: string
  campaign_name?: string
  objective?: string
  impressions?: string
  clicks?: string
  spend?: string
  ctr?: string
  cpc?: string
  actions?: MetaAction[]
}

interface MetaApiErrorPayload {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number }
}

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`
const LEAD_ACTIONS = [
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'contact',
  'submit_application',
  'complete_registration',
]
const TRAFFIC_ACTIONS = [
  'link_click',
  'landing_page_view',
  'post_engagement',
  'page_engagement',
  'post',
  'comment',
  'like',
  'video_view',
  'omni_view_content',
]
const TRAFFIC_OBJECTIVES = new Set([
  'LINK_CLICKS', 'OUTCOME_TRAFFIC', 'POST_ENGAGEMENT', 'OUTCOME_ENGAGEMENT',
  'PAGE_LIKES', 'VIDEO_VIEWS', 'REACH', 'OUTCOME_AWARENESS', 'BRAND_AWARENESS',
])

export function normalizeMetaAccountId(value: string) {
  return value.replace(/^act_/, '').trim()
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createMetaError('Las fechas de Meta Ads deben usar formato YYYY-MM-DD.', 'API_ERROR')
  }
}

function createMetaError(message: string, category: MetaErrorCategory, code?: number, httpStatus?: number): MetaServiceError {
  const error = new Error(message) as MetaServiceError
  error.category = category
  if (code !== undefined) error.code = code
  if (httpStatus !== undefined) error.httpStatus = httpStatus
  return error
}

function classifyMetaError(payload: MetaApiErrorPayload | null, httpStatus?: number): MetaServiceError {
  const metaError = payload?.error
  const code = metaError?.code
  const message = metaError?.message || 'Meta Ads no pudo responder.'
  if (code === 190 || httpStatus === 401) return createMetaError(message, 'AUTHENTICATION_ERROR', code, httpStatus)
  if (code === 200 || code === 10 || code === 100) return createMetaError(message, code === 100 ? 'ACCOUNT_ERROR' : 'PERMISSION_ERROR', code, httpStatus)
  if (code === 17 || code === 32 || httpStatus === 429) return createMetaError(message, 'RATE_LIMIT', code, httpStatus)
  if (code !== undefined || httpStatus !== undefined) return createMetaError(message, 'API_ERROR', code, httpStatus)
  return createMetaError(message, 'UNKNOWN_ERROR')
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null) as MetaApiErrorPayload | null
  if (!response.ok || payload?.error) throw classifyMetaError(payload, response.status)
  return payload as MetaApiErrorPayload & { data?: MetaInsightRow[]; paging?: { next?: string } }
}

async function fetchInsightRows(accountId: string, accessToken: string, dateFrom: string, dateTo: string) {
  const fields = 'campaign_id,campaign_name,objective,impressions,clicks,spend,ctr,cpc,actions'
  let url: string | null = `${META_BASE_URL}/act_${accountId}/insights?${new URLSearchParams({
    access_token: accessToken,
    level: 'campaign',
    fields,
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    limit: '500',
  })}`
  const rows: MetaInsightRow[] = []
  while (url) {
    const payload = await fetchJson(url)
    rows.push(...(payload.data ?? []))
    url = payload.paging?.next ?? null
  }
  return rows
}

async function fetchActiveCampaignIds(accountId: string, accessToken: string) {
  let url: string | null = `${META_BASE_URL}/act_${accountId}/campaigns?${new URLSearchParams({
    access_token: accessToken,
    fields: 'id,effective_status',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: '500',
  })}`
  const ids = new Set<string>()
  while (url) {
    const payload = await fetchJson(url)
    for (const campaign of payload.data ?? []) {
      const campaignId = (campaign as MetaInsightRow & { id?: string }).id
      if (campaignId) ids.add(campaignId)
    }
    url = payload.paging?.next ?? null
  }
  return ids
}

function toNumber(value?: string) {
  return Number.parseFloat(value || '0') || 0
}

function toInt(value?: string) {
  return Math.round(toNumber(value))
}

function classifyAction(objective: string, actions: MetaAction[] | undefined) {
  const available = new Set(actions?.map((action) => action.action_type) ?? [])
  const priorities = TRAFFIC_OBJECTIVES.has(objective) ? [...TRAFFIC_ACTIONS, ...LEAD_ACTIONS] : [...LEAD_ACTIONS, ...TRAFFIC_ACTIONS]
  const actionType = priorities.find((type) => available.has(type)) ?? null
  if (!actionType) return { results: 0, resultType: 'other' as MetaResultType, sourceActionType: null }
  const action = actions?.find((item) => item.action_type === actionType)
  const results = Math.round(toNumber(action?.value))
  let resultType: MetaResultType = 'other'
  if (actionType === 'onsite_conversion.messaging_conversation_started_7d') resultType = 'messaging_conversation'
  else if (actionType === 'contact') resultType = 'contact'
  else if (actionType === 'submit_application') resultType = 'application'
  else if (actionType === 'complete_registration') resultType = 'registration'
  else if (LEAD_ACTIONS.includes(actionType)) resultType = 'lead'
  else if (actionType === 'link_click') resultType = 'link_click'
  else if (actionType === 'landing_page_view') resultType = 'landing_page_view'
  else if (actionType === 'video_view') resultType = 'video_view'
  else if (TRAFFIC_ACTIONS.includes(actionType)) resultType = 'engagement'
  // V1 no calcula ROAS ni valores de compra. Un action_type de purchase
  // nunca entra en las prioridades y queda como `other`, sin llamarlo lead.
  return { results, resultType, sourceActionType: actionType }
}

function legacyLabel(resultType: MetaResultType) {
  return ({
    lead: 'Lead', messaging_conversation: 'Conversacion iniciada', contact: 'Contacto',
    application: 'Aplicacion', registration: 'Registro', link_click: 'Clic en enlace',
    landing_page_view: 'Visita a landing', engagement: 'Interaccion', video_view: 'Reproduccion', other: 'Resultado',
  } satisfies Record<MetaResultType, string>)[resultType]
}

export async function getMetaAccountMetrics(input: MetaAccountMetricsInput): Promise<MetaAccountMetrics> {
  const accountId = normalizeMetaAccountId(input.accountId)
  if (!/^\d{1,20}$/.test(accountId)) throw createMetaError('La cuenta de Meta Ads no tiene un ID válido.', 'ACCOUNT_ERROR')
  assertDate(input.dateFrom); assertDate(input.dateTo)
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) throw createMetaError('META_ADS_ACCESS_TOKEN no está configurado.', 'AUTHENTICATION_ERROR')

  const rowsPromise = fetchInsightRows(accountId, accessToken, input.dateFrom, input.dateTo)
  const activeIdsPromise = input.onlyActiveCampaigns ? fetchActiveCampaignIds(accountId, accessToken) : Promise.resolve<Set<string> | null>(null)
  const [rows, activeIds] = await Promise.all([rowsPromise, activeIdsPromise])
  const campaigns = rows.filter((row) => !activeIds || activeIds.has(row.campaign_id || '')).map((row) => {
    const spend = toNumber(row.spend)
    const result = classifyAction(row.objective || '', row.actions)
    const costPerResult = result.results > 0 ? spend / result.results : 0
    return {
      id: row.campaign_id || '', name: row.campaign_name || 'Sin nombre', objective: row.objective || 'UNKNOWN',
      impressions: toInt(row.impressions), clicks: toInt(row.clicks), spend, results: result.results,
      result_type: result.resultType, source_action_type: result.sourceActionType,
      ctr: toNumber(row.ctr), cpc: toNumber(row.cpc), cost_per_result: costPerResult,
      leads: result.results, cpl: costPerResult, lead_type: legacyLabel(result.resultType),
    }
  }).filter((campaign) => campaign.id)

  const totals = campaigns.reduce((acc, campaign) => ({
    impressions: acc.impressions + campaign.impressions, clicks: acc.clicks + campaign.clicks,
    spend: acc.spend + campaign.spend, results: acc.results + campaign.results,
    ctr: 0, cpc: 0, cost_per_result: 0, leads: acc.leads + campaign.leads, cpl: 0,
  }), { impressions: 0, clicks: 0, spend: 0, results: 0, ctr: 0, cpc: 0, cost_per_result: 0, leads: 0, cpl: 0 })
  totals.ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  totals.cpc = totals.clicks ? totals.spend / totals.clicks : 0
  totals.cost_per_result = totals.results ? totals.spend / totals.results : 0
  totals.cpl = totals.cost_per_result
  const resultsByType: MetaAccountMetrics['results_by_type'] = {}
  for (const campaign of campaigns) {
    const current = resultsByType[campaign.result_type] ?? { results: 0, spend: 0, cost_per_result: 0 }
    current.results += campaign.results; current.spend += campaign.spend
    current.cost_per_result = current.results ? current.spend / current.results : 0
    resultsByType[campaign.result_type] = current
  }
  return {
    account_id: accountId, account_name: input.accountName ?? null, moneda: input.moneda ?? null, zona_horaria: input.zonaHoraria ?? null,
    date_range: { start: input.dateFrom, end: input.dateTo }, totals, results_by_type: resultsByType, campaigns,
  }
}

export function defaultMetaDateRange() {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29)
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) }
}

export function getMetaResultTypeLabel(resultType: MetaResultType) {
  return legacyLabel(resultType)
}

export function getMetaErrorDetails(cause: unknown) {
  const error = cause as Partial<MetaServiceError>
  return { category: error.category || 'UNKNOWN_ERROR', code: error.code, message: error instanceof Error ? error.message : 'No se pudo consultar esta cuenta.' }
}
