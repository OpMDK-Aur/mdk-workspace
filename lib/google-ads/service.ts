import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId, refreshGoogleAdsAccessToken } from '@/lib/google-tokens'
import { CHANNEL_TYPE_LABELS } from './config'

const API_VERSION = 'v23'

export interface GoogleAccountMetricsInput {
  customerId: string
  dateFrom: string
  dateTo: string
  accountName?: string | null
}

export interface GoogleConversionAction {
  name: string
  conversions: number
  conversion_value: number
  campaign_ids: string[]
  campaign_names: string[]
}

export interface GoogleChangeEvent {
  date_time: string
  change_type: string
  resource_type: string
  resource_name: string | null
  user_email: string | null
  campaign_id: string | null
  campaign_name: string | null
  ad_group_id: string | null
  summary: string
}

export interface GoogleAccountMetrics {
  account_id: string
  account_name: string | null
  date_range: { start: string; end: string }
  totals: { impressions: number; clicks: number; spend: number; leads: number; ctr: number; cpc: number; cpl: number }
  conversion_actions: GoogleConversionAction[]
  conversion_actions_available: boolean
  conversion_actions_error: string | null
  change_history: GoogleChangeEvent[]
  change_history_available: boolean
  change_history_error: string | null
  campaigns: Array<Record<string, unknown>>
}

export function normalizeCustomerId(value: string) {
  return value.replace(/-/g, '').trim()
}

export function splitCustomerIds(value: string | null | undefined) {
  return String(value ?? '')
    .split(',')
    .map((id) => normalizeCustomerId(id))
    .filter(Boolean)
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Las fechas de Google Ads deben usar formato YYYY-MM-DD.')
}

// El GOOGLE_ADS_ACCESS_TOKEN estático de las variables de entorno vive ~1h
// y en la práctica llega casi siempre vencido, por lo que cada cuenta
// consultada dispara su propio refresh (hasta 8+ refresh calls simultáneos
// para un mismo cliente). Compartimos en memoria el token ya refrescado
// dentro del mismo proceso para evitar refrescos redundantes concurrentes.
let sharedRefreshedToken: { token: string; expiresAt: number } | null = null
let inFlightRefresh: Promise<string | null> | null = null

async function getSharedRefreshedToken(): Promise<string | null> {
  if (sharedRefreshedToken && sharedRefreshedToken.expiresAt > Date.now()) {
    return sharedRefreshedToken.token
  }
  if (!inFlightRefresh) {
    inFlightRefresh = refreshGoogleAdsAccessToken().finally(() => {
      inFlightRefresh = null
    })
  }
  const token = await inFlightRefresh
  if (token) {
    // Margen conservador de 5 minutos por debajo de la expiración real (~1h).
    sharedRefreshedToken = { token, expiresAt: Date.now() + 50 * 60 * 1000 }
  }
  return token
}

async function fetchRows(customerId: string, query: string) {
  const [developerToken, loginCustomerId] = await Promise.all([
    getGoogleAdsDeveloperToken(),
    getGoogleAdsLoginCustomerId(),
  ])
  const refreshedToken = await getSharedRefreshedToken()
  const tokenResult = refreshedToken ? { accessToken: refreshedToken } : await getGoogleAdsAccessToken()
  const initialToken = tokenResult.accessToken
  if (!initialToken) throw new Error(tokenResult.error || 'No se pudo obtener el access token de Google Ads.')

  let accessToken = refreshedToken || sharedRefreshedToken?.token || initialToken
  let retriedWithRefresh = false
  const rows: any[] = []
  let pageToken: string | undefined
  // IMPORTANTE: usar while(true) + break, NO do-while con `continue`.
  // En un do-while, `continue` salta a evaluar `while (pageToken)`, y como
  // pageToken todavía es undefined en el primer intento, el loop terminaba
  // sin reintentar tras refrescar el token, devolviendo `rows = []` en
  // silencio (sin lanzar error) en cada 401 por token expirado.
  while (true) {
    const response = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, ...(developerToken ? { 'developer-token': developerToken } : {}), ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}), 'Content-Type': 'application/json' },
      // El endpoint googleAds:search NO admite pageSize: devuelve 400
      // PAGE_SIZE_NOT_SUPPORTED. El tamaño de página es fijo (10000 filas)
      // y la paginación se controla únicamente con pageToken.
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : 'Google Ads no pudo responder.'
      const authFailure = response.status === 401 || payload?.error?.status === 'UNAUTHENTICATED'
      if (authFailure && !retriedWithRefresh) {
        const refreshedToken = await getSharedRefreshedToken()
        if (refreshedToken) {
          accessToken = refreshedToken
          retriedWithRefresh = true
          continue
        }
      }
      throw new Error(message)
    }
    rows.push(...(payload?.results ?? []))
    pageToken = payload?.nextPageToken
    if (!pageToken) break
  }
  return rows
}

export async function getGoogleChangeHistory(input: GoogleAccountMetricsInput): Promise<{ events: GoogleChangeEvent[]; available: boolean; error: string | null }> {
  const customerId = normalizeCustomerId(input.customerId)
  assertDate(input.dateFrom)
  assertDate(input.dateTo)
  try {
    // change_event solo admite sus propios campos; joins con campaign/ad_group y
    // change_type provocan INVALID_ARGUMENT en Google Ads GAQL.
    const rows = await fetchRows(customerId, `SELECT change_event.change_date_time, change_event.change_resource_type, change_event.change_resource_name, change_event.user_email, change_event.resource_change_operation FROM change_event WHERE change_event.change_date_time >= '${input.dateFrom} 00:00:00' AND change_event.change_date_time <= '${input.dateTo} 23:59:59' ORDER BY change_event.change_date_time DESC LIMIT 200`)
    const events = rows.map((row) => {
      const change = row.changeEvent ?? row.change_event ?? {}
      const dateTime = String(change.changeDateTime ?? change.change_date_time ?? '')
      const changeType = String(change.resourceChangeOperation ?? change.resource_change_operation ?? 'UNKNOWN')
      const resourceType = String(change.changeResourceType ?? change.change_resource_type ?? 'UNKNOWN')
      const resourceName = change.changeResourceName ?? change.change_resource_name ?? null
      const userEmail = change.userEmail ?? change.user_email ?? null
      return {
        date_time: dateTime,
        change_type: changeType,
        resource_type: resourceType,
        resource_name: resourceName,
        user_email: userEmail,
        campaign_id: null,
        campaign_name: null,
        ad_group_id: null,
        summary: `${changeType} en ${resourceType}${resourceName ? ` — ${resourceName}` : ''}`,
      }
    }).filter((event) => event.date_time)
    return { events, available: true, error: null }
  } catch (cause) {
    const error = cause instanceof Error ? cause.message.slice(0, 240) : 'Google Ads Change History no está disponible.'
    console.warn('[v0] Google Ads Change History unavailable:', error)
    return { events: [], available: false, error }
  }
}

export async function getGoogleAccountMetrics(input: GoogleAccountMetricsInput): Promise<GoogleAccountMetrics> {
  const customerId = normalizeCustomerId(input.customerId)
  if (!/^\d{6,20}$/.test(customerId)) throw new Error('La cuenta de Google Ads no tiene un ID válido.')
  assertDate(input.dateFrom)
  assertDate(input.dateTo)
  const dateFilter = `segments.date BETWEEN '${input.dateFrom}' AND '${input.dateTo}'`
  // Incluir campañas pausadas/finalizadas que tuvieron actividad dentro del período.
  // Filtrar solo ENABLED devuelve cero cuando la cuenta tiene campañas históricas pausadas.
  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.average_cpc, metrics.ctr, metrics.conversions, segments.date FROM campaign WHERE ${dateFilter} ORDER BY metrics.cost_micros DESC`
  let rows: any[]
  try {
    rows = await fetchRows(customerId, query)
  } catch {
    rows = await fetchRows(customerId, `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, segments.date FROM campaign WHERE ${dateFilter} ORDER BY metrics.cost_micros DESC`)
  }

  const campaignMap = new Map<string, {
    id: string
    name: string
    status: string
    advertising_channel_type: string
    budget: number
    impressions: number
    clicks: number
    spend: number
    leads: number
  }>()

  for (const row of rows) {
    const metrics = row.metrics ?? {}
    const campaign = row.campaign ?? {}
    const budget = row.campaignBudget ?? row.campaign_budget ?? {}
    const cost = Number(metrics.costMicros ?? metrics.cost_micros ?? 0) / 1_000_000
    const clicks = Number(metrics.clicks ?? 0)
    const impressions = Number(metrics.impressions ?? 0)
    const leads = Number(metrics.conversions ?? 0)
    const id = String(campaign.id ?? '')
    if (!id) continue
    const current = campaignMap.get(id)
    if (current) {
      current.impressions += impressions
      current.clicks += clicks
      current.spend += cost
      current.leads += leads
      if (!current.budget) current.budget = Number(budget.amountMicros ?? budget.amount_micros ?? 0) / 1_000_000
    } else {
      campaignMap.set(id, {
        id,
        name: campaign.name ?? 'Sin nombre',
        status: campaign.status ?? 'UNKNOWN',
        advertising_channel_type: campaign.advertisingChannelType ?? campaign.advertising_channel_type ?? 'UNKNOWN',
        budget: Number(budget.amountMicros ?? budget.amount_micros ?? 0) / 1_000_000,
        impressions,
        clicks,
        spend: cost,
        leads,
      })
    }
  }

  const campaigns = [...campaignMap.values()].map((campaign) => ({
    ...campaign,
    channel_label: CHANNEL_TYPE_LABELS[campaign.advertising_channel_type] ?? campaign.advertising_channel_type,
    ctr: campaign.impressions ? (campaign.clicks / campaign.impressions) * 100 : 0,
    cpc: campaign.clicks ? campaign.spend / campaign.clicks : 0,
    cpl: campaign.leads ? campaign.spend / campaign.leads : 0,
  })).sort((a, b) => b.spend - a.spend)

  const totals = campaigns.reduce((acc, campaign) => ({
    impressions: acc.impressions + campaign.impressions,
    clicks: acc.clicks + campaign.clicks,
    spend: acc.spend + campaign.spend,
    leads: acc.leads + campaign.leads,
    ctr: 0, cpc: 0, cpl: 0,
  }), { impressions: 0, clicks: 0, spend: 0, leads: 0, ctr: 0, cpc: 0, cpl: 0 })
  totals.ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0
  totals.cpc = totals.clicks ? totals.spend / totals.clicks : 0
  totals.cpl = totals.leads ? totals.spend / totals.leads : 0

  let conversion_actions: GoogleConversionAction[] = []
  let conversion_actions_available = true
  let conversion_actions_error: string | null = null
  try {
    const conversionRows = await fetchRows(customerId, `SELECT campaign.id, campaign.name, segments.conversion_action_name, metrics.conversions, metrics.conversions_value FROM ad_group_ad WHERE ${dateFilter} AND campaign.status != 'REMOVED' ORDER BY metrics.conversions DESC`)
    const actionMap = new Map<string, GoogleConversionAction>()
    for (const row of conversionRows) {
      const action = row.segments?.conversionActionName ?? row.segments?.conversion_action_name
      const name = typeof action === 'string' ? action.trim() : ''
      if (!name) continue
      const campaign = row.campaign ?? {}
      const campaignId = String(campaign.id ?? '')
      const campaignName = String(campaign.name ?? '')
      const current = actionMap.get(name) ?? { name, conversions: 0, conversion_value: 0, campaign_ids: [], campaign_names: [] }
      current.conversions += Number(row.metrics?.conversions ?? 0)
      current.conversion_value += Number(row.metrics?.conversionsValue ?? row.metrics?.conversions_value ?? 0)
      if (campaignId && !current.campaign_ids.includes(campaignId)) current.campaign_ids.push(campaignId)
      if (campaignName && !current.campaign_names.includes(campaignName)) current.campaign_names.push(campaignName)
      actionMap.set(name, current)
    }
    conversion_actions = [...actionMap.values()].sort((a, b) => b.conversions - a.conversions)
  } catch (cause) {
    conversion_actions_available = false
    conversion_actions_error = cause instanceof Error ? cause.message.slice(0, 240) : 'No se pudo obtener el desglose por acción de conversión.'
    console.warn('[v0] Google Ads conversion action breakdown unavailable:', conversion_actions_error)
  }

  const history = await getGoogleChangeHistory(input)
  return { account_id: customerId, account_name: input.accountName ?? null, date_range: { start: input.dateFrom, end: input.dateTo }, totals, conversion_actions, conversion_actions_available, conversion_actions_error, change_history: history.events, change_history_available: history.available, change_history_error: history.error, campaigns }
}

export function defaultGoogleDateRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  return { dateFrom: iso(start), dateTo: iso(end) }
}
