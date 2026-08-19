import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId, refreshGoogleAdsAccessToken } from '@/lib/google-tokens'
import { CHANNEL_TYPE_LABELS } from './config'

const API_VERSION = 'v23'
const PAGE_SIZE = 1000

export interface GoogleAccountMetricsInput {
  customerId: string
  dateFrom: string
  dateTo: string
  accountName?: string | null
}

export interface GoogleAccountMetrics {
  account_id: string
  account_name: string | null
  date_range: { start: string; end: string }
  totals: { impressions: number; clicks: number; spend: number; leads: number; ctr: number; cpc: number; cpl: number }
  campaigns: Array<Record<string, unknown>>
}

export function normalizeCustomerId(value: string) {
  return value.replace(/-/g, '').trim()
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Las fechas de Google Ads deben usar formato YYYY-MM-DD.')
}

async function fetchRows(customerId: string, query: string) {
  const [{ accessToken: initialToken, error: tokenError }, developerToken, loginCustomerId] = await Promise.all([
    getGoogleAdsAccessToken(),
    getGoogleAdsDeveloperToken(),
    getGoogleAdsLoginCustomerId(),
  ])
  if (!initialToken) throw new Error(tokenError || 'No se pudo obtener el access token de Google Ads.')

  let accessToken = initialToken
  let retriedWithRefresh = false
  const rows: any[] = []
  let pageToken: string | undefined
  do {
    const response = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, ...(developerToken ? { 'developer-token': developerToken } : {}), ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, pageSize: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) }),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = typeof payload?.error?.message === 'string' ? payload.error.message : 'Google Ads no pudo responder.'
      const authFailure = response.status === 401 || payload?.error?.status === 'UNAUTHENTICATED'
      if (authFailure && !retriedWithRefresh) {
        const refreshedToken = await refreshGoogleAdsAccessToken()
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
  } while (pageToken)
  return rows
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
  return { account_id: customerId, account_name: input.accountName ?? null, date_range: { start: input.dateFrom, end: input.dateTo }, totals, campaigns }
}

export function defaultGoogleDateRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  return { dateFrom: iso(start), dateTo: iso(end) }
}
