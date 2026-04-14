import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedAdsData, setCachedAdsData } from '@/lib/ads-cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GoogleAdsRestRow {
  campaign: {
    id: string
    name: string
    status: string
    advertisingChannelType: string
    advertising_channel_type?: string
  }
  campaignBudget?: {
    amountMicros: string
    amount_micros?: string
  }
  segments?: {
    conversionActionName?: string
    conversion_action_name?: string
    date?: string
  }
  metrics: {
    impressions: string
    clicks: string
    costMicros: string
    cost_micros?: string
    averageCpc?: string
    average_cpc?: string
    ctr?: string
    conversions: string
    conversionsValue?: string
    allConversions?: string
  }
}

interface GoogleAdsSearchResponse {
  results?: GoogleAdsRestRow[]
  nextPageToken?: string
  error?: {
    code: number
    message: string
    status: string
    details?: Array<{
      errors?: Array<{ message?: string }>
    }>
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GOOGLE_ADS_API_VERSION = 'v23'
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  SEARCH: 'Busqueda',
  DISPLAY: 'Display',
  SHOPPING: 'Shopping',
  VIDEO: 'Video (YouTube)',
  SMART: 'Smart',
  PERFORMANCE_MAX: 'Performance Max',
  DISCOVERY: 'Discovery',
  APP_CAMPAIGN: 'Aplicaciones',
  LOCAL: 'Local',
  UNSPECIFIED: 'Sin especificar',
  UNKNOWN: 'Otro',
}

// ---------------------------------------------------------------------------
// Date helpers — local date, no timezone issues
// ---------------------------------------------------------------------------
function padded(n: number): string {
  return String(n).padStart(2, '0')
}

// Google Ads GAQL requires ISO format yyyy-MM-dd for segments.date filters
function localIso(d: Date): string {
  return `${d.getFullYear()}-${padded(d.getMonth() + 1)}-${padded(d.getDate())}`
}

function buildDateFilter(
  dateRange: string,
  startDate?: string,
  endDate?: string
): { clause: string; start: string; end: string } {
  if (startDate && endDate) {
    return {
      clause: `segments.date BETWEEN '${startDate}' AND '${endDate}'`,
      start: startDate,
      end: endDate,
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const offset = (days: number) => {
    const d = new Date(today)
    d.setDate(today.getDate() - days)
    return d
  }

  switch (dateRange) {
    case 'last_7d': {
      const s = offset(7)
      return { clause: `segments.date BETWEEN '${localIso(s)}' AND '${localIso(today)}'`, start: localIso(s), end: localIso(today) }
    }
    case 'last_14d': {
      const s = offset(14)
      return { clause: `segments.date BETWEEN '${localIso(s)}' AND '${localIso(today)}'`, start: localIso(s), end: localIso(today) }
    }
    case 'monthly': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { clause: `segments.date BETWEEN '${localIso(s)}' AND '${localIso(e)}'`, start: localIso(s), end: localIso(e) }
    }
    case 'yearly': {
      const s = new Date(today.getFullYear(), 0, 1)
      const e = new Date(today.getFullYear(), 11, 31)
      return { clause: `segments.date BETWEEN '${localIso(s)}' AND '${localIso(e)}'`, start: localIso(s), end: localIso(e) }
    }
    case 'daily': {
      return { clause: `segments.date = '${localIso(today)}'`, start: localIso(today), end: localIso(today) }
    }
    default: { // last_30d
      const s = offset(30)
      return { clause: `segments.date BETWEEN '${localIso(s)}' AND '${localIso(today)}'`, start: localIso(s), end: localIso(today) }
    }
  }
}

// ---------------------------------------------------------------------------
// Access token — read from platform_tokens table and refresh if expired
// ---------------------------------------------------------------------------
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    
    // Read token from platform_tokens table
    const { data: tokenData, error } = await supabase
      .from('platform_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('platform', 'google_ads')
      .single()
    
    if (error || !tokenData) {
      console.warn('[google-ads] No token found in platform_tokens — user must connect Google OAuth')
      return null
    }
    
    // Check if token is expired or will expire in the next 5 minutes
    const expiryTime = new Date(tokenData.token_expiry).getTime()
    const now = Date.now()
    const bufferMs = 5 * 60 * 1000 // 5 minutes buffer
    
    if (expiryTime > now + bufferMs) {
      // Token is still valid
      return tokenData.access_token
    }
    
    // Token is expired or expiring soon, refresh it
    if (!tokenData.refresh_token) {
      console.warn('[google-ads] Token expired and no refresh_token — user must re-authorize')
      return null
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      console.error('[google-ads] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET')
      return null
    }
    
    // Refresh the token
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    
    const refreshData = await refreshRes.json()
    
    if (!refreshRes.ok || !refreshData.access_token) {
      console.error('[google-ads] Failed to refresh token:', refreshData)
      return null
    }
    
    // Update token in database
    const newExpiry = new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString()
    
    await supabase
      .from('platform_tokens')
      .update({
        access_token: refreshData.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('platform', 'google_ads')
    
    return refreshData.access_token
  } catch (e) {
    console.error('[google-ads] Error getting access token:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Paginated search — iterates nextPageToken
// ---------------------------------------------------------------------------
async function fetchAllCampaigns(
  cleanCustomerId: string,
  gaqlQuery: string,
  headers: HeadersInit
): Promise<{ rows: GoogleAdsRestRow[]; apiError: string | null }> {
  const rows: GoogleAdsRestRow[] = []
  let pageToken: string | undefined = undefined

  do {
    const body: Record<string, string> = { query: gaqlQuery }
    if (pageToken) body.pageToken = pageToken

    const url = `${GOOGLE_ADS_BASE_URL}/customers/${cleanCustomerId}/googleAds:search`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    let json: GoogleAdsSearchResponse
    try {
      json = await res.clone().json()
    } catch {
      const text = await res.text().catch(() => '(unreadable)')
      console.error('[google-ads] Non-JSON response:', res.status, text.slice(0, 500))
      return { rows, apiError: `Google Ads API returned HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    if (!res.ok || json.error) {
      const msg = json.error?.details?.[0]?.errors?.[0]?.message ?? json.error?.message ?? `HTTP ${res.status}`
      console.error('[google-ads] API error:', JSON.stringify(json.error ?? json))
      return { rows, apiError: msg }
    }

    if (Array.isArray(json.results)) {
      rows.push(...json.results)
    }

    pageToken = json.nextPageToken
  } while (pageToken)

  return { rows, apiError: null }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const customerId = sp.get('customer_id')
    const dateRange = sp.get('date_range') || 'last_30d'
    const startDate = sp.get('start_date') ?? undefined
    const endDate = sp.get('end_date') ?? undefined

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    const cleanCustomerId = customerId.replace(/-/g, '')

    const bustCache = sp.get('bust') === '1'

    // Cache check — skip if bust=1
    if (!bustCache) {
      const cached = await getCachedAdsData('google', cleanCustomerId, dateRange, startDate, endDate)
      if (cached) return NextResponse.json({ ...cached, from_cache: true })
    }

    // Credentials
    const accessToken = await getAccessToken()
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN

    if (!accessToken) {
      return NextResponse.json({
        error: 'No se pudo obtener el access token de Google. El usuario debe re-autorizar Google OAuth desde Plataformas.',
      }, { status: 401 })
    }
    if (!developerToken) {
      return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN no configurado.' }, { status: 500 })
    }

    // Build date clause
    const { clause: dateClause, start: rangeStart, end: rangeEnd } = buildDateFilter(dateRange, startDate, endDate)

    // Primary query — campaign resource does NOT support segments.conversion_action_name
    // alongside metrics.clicks/cost_micros/impressions (Google Ads API restriction)
    const gaqlQuery = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.average_cpc,
        metrics.ctr,
        metrics.conversions,
        segments.date
      FROM campaign
      WHERE ${dateClause}
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `

    // Fallback query — no budget field
    const fallbackQuery = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        segments.date
      FROM campaign
      WHERE ${dateClause}
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `

    // Conversion-action query — run in parallel.
    // segments.conversion_action_name IS compatible with metrics.conversions
    // in the campaign resource ONLY when no performance metrics (clicks/cost/impressions) are selected.
    const conversionQuery = `
      SELECT
        campaign.id,
        segments.conversion_action_name,
        metrics.conversions,
        metrics.all_conversions
      FROM campaign
      WHERE ${dateClause}
        AND campaign.status != 'REMOVED'
        AND metrics.all_conversions > 0
    `

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') ?? '4435948073',
    }

    // Run both queries in parallel — they use different field sets to avoid
    // the "unsupported metric" error that occurs when mixing performance
    // metrics with segments.conversion_action_name in the same query
    let rows: GoogleAdsRestRow[]
    let apiError: string | null

    const [primary, convResult] = await Promise.all([
      fetchAllCampaigns(cleanCustomerId, gaqlQuery, headers),
      fetchAllCampaigns(cleanCustomerId, conversionQuery, headers),
    ])

    if (primary.apiError) {
      console.error('[google-ads] Primary query failed, trying fallback:', primary.apiError)
      const fallback = await fetchAllCampaigns(cleanCustomerId, fallbackQuery, headers)
      rows = fallback.rows
      apiError = fallback.apiError
    } else {
      rows = primary.rows
      apiError = null
    }

    // Build a lookup: campaignId → Set<conversionActionName> from the conversion query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convNamesByCampaign = new Map<string, Set<string>>()
    if (!convResult.apiError) {
      for (const row of convResult.rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any
        const cid: string = r.campaign?.id ?? ''
        const name: string =
          r.segments?.conversionActionName ??
          r.segments?.conversion_action_name ?? ''
        if (cid && name) {
          if (!convNamesByCampaign.has(cid)) convNamesByCampaign.set(cid, new Set())
          convNamesByCampaign.get(cid)!.add(name)
        }
      }
    }

    if (apiError) {
      return NextResponse.json({ error: apiError, details: apiError }, { status: 400 })
    }

    // Map rows — aggregate by campaign.id since segments.date produces one row per day
    type CampaignAgg = {
      id: string; name: string; status: string
      advertisingChannelType: string
      amountMicros: number
      impressions: number; clicks: number; costMicros: number; conversions: number
      conversionActionNames: Set<string>
    }

    // Helper: read a field supporting both camelCase and snake_case from API response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function field(obj: any, camel: string, snake: string): string {
      return obj?.[camel] ?? obj?.[snake] ?? '0'
    }

    const campaignMap = new Map<string, CampaignAgg>()
    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const id: string = r.campaign?.id ?? ''
      const metrics = r.metrics ?? {}
      const budget  = r.campaignBudget ?? r.campaign_budget ?? {}

      const impressions  = Number(field(metrics, 'impressions',  'impressions'))
      const clicks       = Number(field(metrics, 'clicks',       'clicks'))
      const costMicros   = Number(field(metrics, 'costMicros',   'cost_micros'))
      const conversions  = Number(field(metrics, 'conversions',  'conversions'))
      const amountMicros = Number(field(budget,  'amountMicros', 'amount_micros'))
      const chanType     = r.campaign?.advertisingChannelType ?? r.campaign?.advertising_channel_type ?? 'UNKNOWN'
      const convName: string = r.segments?.conversionActionName ?? r.segments?.conversion_action_name ?? ''

      const existing = campaignMap.get(id)
      if (existing) {
        existing.impressions  += impressions
        existing.clicks       += clicks
        existing.costMicros   += costMicros
        existing.conversions  += conversions
        if (!existing.amountMicros && amountMicros) existing.amountMicros = amountMicros
        // convName from main query is always empty now (field removed), but keep for safety
        if (convName) existing.conversionActionNames.add(convName)
        // Merge names from the dedicated conversion query
        convNamesByCampaign.get(id)?.forEach(n => existing.conversionActionNames.add(n))
      } else {
        const initNames = new Set<string>()
        if (convName) initNames.add(convName)
        convNamesByCampaign.get(id)?.forEach(n => initNames.add(n))
        campaignMap.set(id, {
          id,
          name:                   r.campaign?.name ?? '',
          status:                 r.campaign?.status ?? 'UNKNOWN',
          advertisingChannelType: chanType,
          amountMicros,
          impressions,
          clicks,
          costMicros,
          conversions,
          conversionActionNames: initNames,
        })
      }
    }

    const campaigns = [...campaignMap.values()].map((agg) => {
      const spend      = agg.costMicros / 1_000_000
      const budget     = agg.amountMicros / 1_000_000
      const impressions = agg.impressions
      const clicks     = agg.clicks
      const leads      = agg.conversions
      const ctr        = impressions > 0 ? (clicks / impressions) * 100 : 0
      const cpc        = clicks > 0 ? spend / clicks : 0
      const cpl        = leads > 0 ? spend / leads : 0
      const channelType = agg.advertisingChannelType

      return {
        id: agg.id,
        name: agg.name,
        status: agg.status,
        advertising_channel_type: channelType,
        channel_label: CHANNEL_TYPE_LABELS[channelType] ?? channelType,
        conversion_action_name: (
          [...agg.conversionActionNames]
            .filter(n => Boolean(n) && !n.toLowerCase().includes('all') && !n.toLowerCase().includes('todos'))
            .join(' / ')
        ) || (CHANNEL_TYPE_LABELS[channelType] ?? channelType),
        budget: Math.round(budget * 100) / 100,
        impressions,
        clicks,
        spend:  Math.round(spend * 100) / 100,
        leads,
        ctr:    Math.round(ctr * 100) / 100,
        cpc:    Math.round(cpc * 100) / 100,
        cpl:    Math.round(cpl * 100) / 100,
        revenue: 0,
      }
    }).sort((a, b) => b.spend - a.spend)

    // Totals
    const totals = campaigns.reduce(
      (acc, c) => { acc.impressions += c.impressions; acc.clicks += c.clicks; acc.spend += c.spend; acc.leads += c.leads; return acc },
      { impressions: 0, clicks: 0, spend: 0, leads: 0 }
    )
    const totalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    const totalCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    const totalCpl = totals.leads > 0 ? totals.spend / totals.leads : 0

    // Campaign type distribution — uses already-normalized advertising_channel_type
    const typeMap = new Map<string, { spend: number; leads: number }>()
    for (const c of campaigns) {
      const t = c.advertising_channel_type
      const existing = typeMap.get(t) ?? { spend: 0, leads: 0 }
      typeMap.set(t, { spend: existing.spend + c.spend, leads: existing.leads + c.leads })
    }
    const campaignTypes = [...typeMap.entries()]
      .map(([type, data]) => ({
        type,
        label: CHANNEL_TYPE_LABELS[type] ?? type,
        spend: Math.round(data.spend * 100) / 100,
        leads: data.leads,
        percentage: totals.spend > 0 ? Math.round((data.spend / totals.spend) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend)

    const responsePayload = {
      platform: 'google',
      customer_id: customerId,
      date_range: { start: rangeStart, end: rangeEnd },
      campaigns,
      campaign_types: campaignTypes,
      totals: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        spend: Math.round(totals.spend * 100) / 100,
        leads: totals.leads,
        ctr: Math.round(totalCtr * 100) / 100,
        cpc: Math.round(totalCpc * 100) / 100,
        cpl: Math.round(totalCpl * 100) / 100,
      },
    }

    setCachedAdsData('google', cleanCustomerId, dateRange, responsePayload, startDate, endDate)

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('[google-ads] Unhandled error:', error)
    return NextResponse.json({ error: 'Failed to fetch Google Ads data' }, { status: 500 })
  }
}
