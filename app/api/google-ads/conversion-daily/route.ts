import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_ADS_API_VERSION = 'v23'
const BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

function pad(n: number) { return String(n).padStart(2, '0') }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function buildDateClause(dateRange: string, start?: string, end?: string): string {
  if (start && end) return `segments.date BETWEEN '${start}' AND '${end}'`
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const offset = (n: number) => { const d = new Date(today); d.setDate(today.getDate() - n); return d }
  switch (dateRange) {
    case 'last_7d':  return `segments.date BETWEEN '${toIso(offset(7))}' AND '${toIso(today)}'`
    case 'last_14d': return `segments.date BETWEEN '${toIso(offset(14))}' AND '${toIso(today)}'`
    case 'daily':    return `segments.date = '${toIso(today)}'`
    case 'monthly': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return `segments.date BETWEEN '${toIso(s)}' AND '${toIso(e)}'`
    }
    case 'yearly': {
      const s = new Date(today.getFullYear(), 0, 1)
      const e = new Date(today.getFullYear(), 11, 31)
      return `segments.date BETWEEN '${toIso(s)}' AND '${toIso(e)}'`
    }
    default: return `segments.date BETWEEN '${toIso(offset(30))}' AND '${toIso(today)}'`
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gaqlSearch(customerId: string, query: string, headers: HeadersInit): Promise<any[]> {
  const rows: unknown[] = []
  let pageToken: string | undefined
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = { query }
    if (pageToken) body.pageToken = pageToken
    const res = await fetch(`${BASE_URL}/customers/${customerId}/googleAds:search`, {
      method: 'POST', headers, body: JSON.stringify(body),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json()
    if (!res.ok || json.error) {
      const msg = json.error?.details?.[0]?.errors?.[0]?.message ?? json.error?.message ?? `HTTP ${res.status}`
      throw new Error(msg)
    }
    rows.push(...(json.results ?? []))
    pageToken = json.nextPageToken
  } while (pageToken)
  return rows
}

export async function POST(req: NextRequest) {
  try {
    const { customerId, campaignId, dateRange, startDate, endDate } = await req.json()
    if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.provider_token) return NextResponse.json({ error: 'No Google token' }, { status: 401 })

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    if (!developerToken) return NextResponse.json({ error: 'Missing GOOGLE_ADS_DEVELOPER_TOKEN' }, { status: 500 })

    const cleanId = customerId.replace(/-/g, '')
    const dateClause = buildDateClause(dateRange ?? 'last_30d', startDate, endDate)

    const campaignFilter = campaignId ? `AND campaign.id = ${campaignId}` : ''

    // This query is valid: segments.conversion_action_name + segments.date
    // are both compatible with metrics.conversions in the campaign resource
    // when NO performance metrics (clicks/cost/impressions) are selected.
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        segments.conversion_action_name,
        segments.date,
        metrics.conversions,
        metrics.all_conversions
      FROM campaign
      WHERE ${dateClause}
        AND campaign.status != 'REMOVED'
        ${campaignFilter}
        AND metrics.all_conversions > 0
      ORDER BY segments.date ASC
    `

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.provider_token}`,
      'developer-token': developerToken,
      'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') ?? cleanId,
    }

    const rawRows = await gaqlSearch(cleanId, query, headers)

    // Build pivot: rows = conversion names, columns = dates
    // { [conversionName]: { [date]: number } }
    const pivot: Record<string, Record<string, number>> = {}
    const datesSet = new Set<string>()

    for (const row of rawRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const name: string = r.segments?.conversionActionName ?? r.segments?.conversion_action_name ?? 'Sin nombre'
      const date: string = r.segments?.date ?? ''
      const conv = parseFloat(String(r.metrics?.conversions ?? 0)) || parseFloat(String(r.metrics?.allConversions ?? r.metrics?.all_conversions ?? 0))

      if (!date) continue
      datesSet.add(date)
      if (!pivot[name]) pivot[name] = {}
      pivot[name][date] = (pivot[name][date] ?? 0) + conv
    }

    const dates = Array.from(datesSet).sort()
    const conversionNames = Object.keys(pivot)

    return NextResponse.json({ dates, pivot, conversionNames, total: rawRows.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[v0] conversion-daily error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
