import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

// ---------------------------------------------------------------------------
// Meta breakdown — fetches day or month level data
// ---------------------------------------------------------------------------
async function fetchMetaBreakdown(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
  granularity: 'daily' | 'monthly',
  campaignId?: string
) {
  const timeIncrement = granularity === 'daily' ? '1' : 'monthly'
  const fields = 'date_start,date_stop,impressions,clicks,spend,ctr,cpc,actions'
  
  // If filtering by campaign, use campaign-level endpoint
  const baseEndpoint = campaignId
    ? `https://graph.facebook.com/v25.0/${campaignId}/insights`
    : `https://graph.facebook.com/v25.0/act_${accountId}/insights`
  
  const params: Record<string, string> = {
    access_token: accessToken,
    level: campaignId ? 'campaign' : 'account',
    fields,
    time_range: JSON.stringify({ since, until }),
    time_increment: timeIncrement,
    limit: '500',
  }
  const url = `${baseEndpoint}?${new URLSearchParams(params)}`

  const res = await fetch(url)
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)

  const LEAD_PRIORITY = [
    'lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped',
    'offsite_conversion.fb_pixel_lead',
    'onsite_conversion.messaging_conversation_started_7d',
  ]

  return (json.data ?? []).map((row: Record<string, unknown>) => {
    const actions = (row.actions as Array<{ action_type: string; value: string }> | undefined) ?? []
    let leads = 0
    for (const t of LEAD_PRIORITY) {
      const m = actions.find(a => a.action_type === t)
      if (m) { leads = Math.round(parseFloat(m.value) || 0); break }
    }
    const spend = parseFloat(row.spend as string || '0')
    const impressions = parseInt(row.impressions as string || '0')
    const clicks = parseInt(row.clicks as string || '0')
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    const cpl = leads > 0 ? spend / leads : 0
    const period = granularity === 'monthly'
      ? (row.date_start as string).slice(0, 7)   // YYYY-MM
      : row.date_start as string                   // YYYY-MM-DD

    return { period, impressions, clicks, spend, leads, ctr, cpl }
  })
}

// ---------------------------------------------------------------------------
// Google Ads breakdown
// ---------------------------------------------------------------------------
async function fetchGoogleBreakdown(
  customerId: string,
  accessToken: string,
  developerToken: string,
  startDate: string,
  endDate: string,
  granularity: 'daily' | 'monthly',
  campaignId?: string
) {
  const s = startDate.replace(/-/g, '')
  const e = endDate.replace(/-/g, '')
  const segmentField = granularity === 'daily' ? 'segments.date' : 'segments.month'

  const campaignFilter = campaignId ? `AND campaign.id = '${campaignId}'` : ''

  const query = `
    SELECT
      ${segmentField},
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${s}' AND '${e}'
      AND campaign.status != 'REMOVED'
      ${campaignFilter}
  `

  const url = `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:search`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': getGoogleAdsLoginCustomerId(),
    },
    body: JSON.stringify({ query }),
  })

  const json = await res.json()
  if (json.error) throw new Error(json.error.message ?? 'Google Ads API error')

  // Helper: read a field supporting both camelCase and snake_case — same as google/route.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function field(obj: any, camel: string, snake: string): string {
    return String(obj?.[camel] ?? obj?.[snake] ?? '0')
  }

  // Aggregate rows by period
  const periodMap = new Map<string, { impressions: number; clicks: number; costMicros: number; conversions: number }>()

  for (const row of (json.results ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const seg = r.segments ?? {}
    const metrics = r.metrics ?? {}

    // Prefer camelCase from REST API, fall back to snake_case
    const rawPeriod: string = seg.date ?? seg.month ?? ''
    const period = granularity === 'monthly' ? rawPeriod.slice(0, 7) : rawPeriod

    if (!period) continue

    const impressions = Number(field(metrics, 'impressions', 'impressions'))
    const clicks      = Number(field(metrics, 'clicks', 'clicks'))
    const costMicros  = Number(field(metrics, 'costMicros', 'cost_micros'))
    const conversions = Number(field(metrics, 'conversions', 'conversions'))

    const ex = periodMap.get(period) ?? { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }
    periodMap.set(period, {
      impressions:  ex.impressions  + impressions,
      clicks:       ex.clicks       + clicks,
      costMicros:   ex.costMicros   + costMicros,
      conversions:  ex.conversions  + conversions,
    })
  }

  return [...periodMap.entries()].map(([period, agg]) => {
    const spend = agg.costMicros / 1_000_000
    const leads = agg.conversions
    const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0
    const cpl = leads > 0 ? spend / leads : 0
    return { period, impressions: agg.impressions, clicks: agg.clicks, spend, leads, ctr, cpl }
  }).sort((a, b) => a.period.localeCompare(b.period))
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
    const platform   = sp.get('platform') as 'meta' | 'google' | null
    const accountId  = sp.get('account_id')
    const customerId = sp.get('customer_id')
    const startDate  = sp.get('start_date') ?? ''
    const endDate    = sp.get('end_date') ?? ''
    const granularity = (sp.get('granularity') ?? 'daily') as 'daily' | 'monthly'
    const campaignId  = sp.get('campaign_id') ?? undefined

    if (!platform || !startDate || !endDate) {
      return NextResponse.json({ error: 'platform, start_date and end_date are required' }, { status: 400 })
    }

    if (platform === 'meta') {
      const accessToken = process.env.META_ADS_ACCESS_TOKEN
      if (!accessToken) return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN not configured' }, { status: 500 })
      if (!accountId) return NextResponse.json({ error: 'account_id required for meta' }, { status: 400 })
      const rows = await fetchMetaBreakdown(accountId.replace(/^act_/, ''), accessToken, startDate, endDate, granularity, campaignId)
      return NextResponse.json({ platform, granularity, rows })
    }

    if (platform === 'google') {
      const developerToken = getGoogleAdsDeveloperToken()
      if (!developerToken) return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' }, { status: 500 })
      if (!customerId) return NextResponse.json({ error: 'customer_id required for google' }, { status: 400 })

      const { accessToken, error: tokenError } = await getGoogleAdsAccessToken()
      if (!accessToken) return NextResponse.json({ error: tokenError || 'No se pudo obtener el access token de Google Ads.' }, { status: 401 })

      const rows = await fetchGoogleBreakdown(customerId.replace(/-/g, ''), accessToken, developerToken, startDate, endDate, granularity, campaignId)
      return NextResponse.json({ platform, granularity, rows })
    }

    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[ads-breakdown]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
