import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

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

    const { accessToken, error: tokenError } = await getGoogleAdsAccessToken()
    if (!accessToken) return NextResponse.json({ error: tokenError || 'No se pudo obtener el access token de Google Ads.' }, { status: 401 })

    const developerToken = getGoogleAdsDeveloperToken()
    if (!developerToken) return NextResponse.json({ error: 'Missing GOOGLE_ADS_DEVELOPER_TOKEN' }, { status: 500 })

    const cleanId = customerId.replace(/-/g, '')
    const dateClause = buildDateClause(dateRange ?? 'last_30d', startDate, endDate)

    const campaignFilter = campaignId ? `AND campaign.id = ${campaignId}` : ''

    // This query includes conversion_action resource to get primary_for_goal
    // which indicates if the conversion is a PRIMARY action or SECONDARY
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        segments.conversion_action_name,
        segments.conversion_action,
        segments.conversion_action_category,
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
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': getGoogleAdsLoginCustomerId(),
    }

    const rawRows = await gaqlSearch(cleanId, query, headers)

    // Build pivot: rows = conversion names, columns = dates
    // { [conversionName]: { [date]: number } }
    const pivot: Record<string, Record<string, number>> = {}
    const conversionTypes: Record<string, 'PRIMARY' | 'SECONDARY'> = {}
    const datesSet = new Set<string>()

    // Categories that are considered "PRIMARY" conversion actions
    // Based on Google Ads documentation: https://developers.google.com/google-ads/api/reference/rpc/v17/ConversionActionCategoryEnum.ConversionActionCategory
    const primaryCategories = new Set([
      'PURCHASE', 'LEAD', 'SIGNUP', 'DOWNLOAD', 'SUBMIT_LEAD_FORM',
      'BOOK_APPOINTMENT', 'REQUEST_QUOTE', 'GET_DIRECTIONS', 'CONTACT',
      'DEFAULT', // Default is typically used for primary actions
    ])

    for (const row of rawRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const name: string = r.segments?.conversionActionName ?? r.segments?.conversion_action_name ?? 'Sin nombre'
      const date: string = r.segments?.date ?? ''
      const category: string = r.segments?.conversionActionCategory ?? r.segments?.conversion_action_category ?? ''
      const conv = parseFloat(String(r.metrics?.conversions ?? 0)) || parseFloat(String(r.metrics?.allConversions ?? r.metrics?.all_conversions ?? 0))

      if (!date) continue
      datesSet.add(date)
      if (!pivot[name]) pivot[name] = {}
      pivot[name][date] = (pivot[name][date] ?? 0) + conv
      
      // Determine if this is a primary or secondary conversion
      // Primary conversions are counted in the "Conversions" column in Google Ads
      // Secondary conversions are tracked but not counted in optimization
      if (!conversionTypes[name]) {
        // Check if category indicates primary action
        const isPrimary = primaryCategories.has(category.toUpperCase())
        conversionTypes[name] = isPrimary ? 'PRIMARY' : 'SECONDARY'
      }
    }

    const dates = Array.from(datesSet).sort()
    const conversionNames = Object.keys(pivot)

    return NextResponse.json({ dates, pivot, conversionNames, conversionTypes, total: rawRows.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[v0] conversion-daily error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
