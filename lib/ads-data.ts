// Shared helpers to fetch REAL ads data directly from Meta & Google APIs.
// These use server-side tokens (env / plataformas_tokens), so they can be called
// from any server context (e.g. the Controller execute route) WITHOUT needing
// the user's session cookie — avoiding the 401/405/cross-domain issues that
// arise when doing HTTP fetches to our own /api routes.

import {
  getGoogleAdsAccessToken,
  getGoogleAdsDeveloperToken,
  getGoogleAdsLoginCustomerId,
} from '@/lib/google-tokens'

// ---------------------------------------------------------------------------
// Shared totals shape
// ---------------------------------------------------------------------------

export interface AdsTotals {
  impressions: number
  clicks: number
  spend: number
  leads: number // Meta: leads/results | Google: conversions
  conversions: number // alias for Google
  ctr: number
  cpc: number
  cpl: number
}

const emptyTotals = (): AdsTotals => ({
  impressions: 0,
  clicks: 0,
  spend: 0,
  leads: 0,
  conversions: 0,
  ctr: 0,
  cpc: 0,
  cpl: 0,
})

// ===========================================================================
// META
// ===========================================================================

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

const LEAD_ACTION_PRIORITY = [
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'contact',
  'submit_application',
  'complete_registration',
]

const TRAFFIC_ACTION_PRIORITY = [
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

const TRAFFIC_OBJECTIVES = [
  'LINK_CLICKS',
  'OUTCOME_TRAFFIC',
  'POST_ENGAGEMENT',
  'OUTCOME_ENGAGEMENT',
  'PAGE_LIKES',
  'VIDEO_VIEWS',
  'REACH',
  'OUTCOME_AWARENESS',
  'BRAND_AWARENESS',
]

function extractResults(
  objective: string,
  actions: Array<{ action_type: string; value: string }> | undefined
): number {
  if (!actions || actions.length === 0) return 0
  const isTraffic = TRAFFIC_OBJECTIVES.includes(objective)
  const priority = isTraffic ? TRAFFIC_ACTION_PRIORITY : LEAD_ACTION_PRIORITY
  for (const type of priority) {
    const match = actions.find((a) => a.action_type === type)
    if (match) return Math.round(parseFloat(match.value) || 0)
  }
  const fallback = isTraffic ? LEAD_ACTION_PRIORITY : TRAFFIC_ACTION_PRIORITY
  for (const type of fallback) {
    const match = actions.find((a) => a.action_type === type)
    if (match) return Math.round(parseFloat(match.value) || 0)
  }
  return 0
}

const toNum = (s: string | undefined): number => parseFloat(s || '0') || 0
const toInt = (s: string | undefined): number => Math.round(parseFloat(s || '0')) || 0

/**
 * Fetch aggregated Meta totals for an account between two dates.
 * Returns real metrics: impressions, clicks, spend, leads, ctr, cpc, cpl.
 */
export async function fetchMetaTotals(
  rawAccountId: string,
  since: string,
  until: string
): Promise<{ totals: AdsTotals; error: string | null }> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!accessToken) {
    return { totals: emptyTotals(), error: 'META_ADS_ACCESS_TOKEN no configurado' }
  }

  const accountId = rawAccountId.replace(/^act_/, '')
  const timeRange = { since, until }

  try {
    const fields =
      'campaign_id,campaign_name,objective,impressions,clicks,spend,ctr,cpc,actions'
    let url: string | null = `${META_BASE_URL}/act_${accountId}/insights?${new URLSearchParams(
      {
        access_token: accessToken,
        level: 'campaign',
        fields,
        time_range: JSON.stringify(timeRange),
        limit: '500',
      }
    )}`

    const rows: Array<{
      objective: string
      impressions: string
      clicks: string
      spend: string
      actions?: Array<{ action_type: string; value: string }>
    }> = []

    while (url) {
      const res: Response = await fetch(url)
      if (!res.ok) {
        const text = await res.text()
        return { totals: emptyTotals(), error: `Meta API HTTP ${res.status}: ${text.slice(0, 200)}` }
      }
      const json: any = await res.json()
      if (json.error) {
        return { totals: emptyTotals(), error: `Meta API error: ${json.error.message}` }
      }
      rows.push(...(json.data ?? []))
      url = json.paging?.next ?? null
    }

    const totals = rows.reduce(
      (acc, row) => {
        acc.impressions += toInt(row.impressions)
        acc.clicks += toInt(row.clicks)
        acc.spend += toNum(row.spend)
        acc.leads += extractResults(row.objective, row.actions)
        return acc
      },
      emptyTotals()
    )

    totals.conversions = totals.leads
    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    totals.cpl = totals.leads > 0 ? totals.spend / totals.leads : 0

    return { totals, error: null }
  } catch (err: any) {
    return { totals: emptyTotals(), error: err?.message || 'Error obteniendo datos de Meta' }
  }
}

// ===========================================================================
// GOOGLE ADS
// ===========================================================================

const GOOGLE_ADS_API_VERSION = 'v23'
const GOOGLE_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

/**
 * Fetch aggregated Google Ads totals for a customer between two dates.
 * Returns real metrics: impressions, clicks, spend, conversions, ctr, cpc.
 */
export async function fetchGoogleTotals(
  rawCustomerId: string,
  since: string,
  until: string
): Promise<{ totals: AdsTotals; error: string | null }> {
  const customerId = rawCustomerId.replace(/-/g, '')

  const { accessToken, error: tokenError } = await getGoogleAdsAccessToken()
  if (!accessToken) {
    return { totals: emptyTotals(), error: tokenError || 'No se pudo obtener el access token de Google Ads.' }
  }

  const developerToken = getGoogleAdsDeveloperToken()
  if (!developerToken) {
    return { totals: emptyTotals(), error: 'GOOGLE_ADS_DEVELOPER_TOKEN no configurado' }
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'login-customer-id': getGoogleAdsLoginCustomerId(),
    'Content-Type': 'application/json',
  }

  // Query aggregated metrics for the date range at customer level.
  const gaql = `
    SELECT
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.all_conversions
    FROM customer
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `

  try {
    const url = `${GOOGLE_BASE_URL}/customers/${customerId}/googleAds:search`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: gaql }),
    })

    const json = await res.json().catch(() => null)

    if (!res.ok || !json || json.error) {
      const msg =
        json?.error?.details?.[0]?.errors?.[0]?.message ??
        json?.error?.message ??
        `HTTP ${res.status}`
      return { totals: emptyTotals(), error: `Google Ads API error: ${msg}` }
    }

    const totals = (json.results ?? []).reduce((acc: AdsTotals, row: any) => {
      const m = row.metrics ?? {}
      acc.impressions += parseInt(String(m.impressions ?? 0)) || 0
      acc.clicks += parseInt(String(m.clicks ?? 0)) || 0
      acc.spend += (parseInt(String(m.costMicros ?? m.cost_micros ?? 0)) || 0) / 1_000_000
      const conv =
        parseFloat(String(m.conversions ?? 0)) ||
        parseFloat(String(m.allConversions ?? m.all_conversions ?? 0)) ||
        0
      acc.conversions += conv
      acc.leads += conv
      return acc
    }, emptyTotals())

    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    totals.cpl = totals.conversions > 0 ? totals.spend / totals.conversions : 0

    return { totals, error: null }
  } catch (err: any) {
    return { totals: emptyTotals(), error: err?.message || 'Error obteniendo datos de Google Ads' }
  }
}
