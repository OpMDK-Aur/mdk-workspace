import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// The Google Ads REST API returns camelCase keys in JSON responses.
// We also handle snake_case as a safety net.
export interface GoogleAdsConversionRow {
  segments?: {
    conversionActionName?: string       // camelCase — returned by REST API
    conversion_action_name?: string     // snake_case — safety net
    conversionAction?: string           // camelCase resource name
    conversion_action?: string          // snake_case resource name
  }
  metrics: {
    conversions?: string | number
    allConversions?: string | number
    all_conversions?: string | number
  }
}

interface GoogleAdsSearchResponse {
  results?: GoogleAdsConversionRow[]
  nextPageToken?: string
  error?: {
    code: number
    message: string
    status: string
    details?: Array<{ errors?: Array<{ message?: string }> }>
  }
}

export interface ConversionResult {
  conversionName: string
  conversionAction: string
  conversions: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GOOGLE_ADS_API_VERSION = 'v23'
const BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

// Use `campaign` as the resource — it is the most reliable resource for
// aggregated conversion-action reporting and supports DURING date literals.
const GAQL = `
  SELECT
    segments.conversion_action_name,
    segments.conversion_action,
    metrics.conversions,
    metrics.all_conversions
  FROM campaign
  WHERE segments.conversion_action IS NOT NULL
  AND metrics.all_conversions > 0
  DURING LAST_30_DAYS
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.provider_token ?? null
  } catch {
    return null
  }
}

function buildHeaders(accessToken: string): HeadersInit {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') ?? '',
    'Content-Type': 'application/json',
  }
}

async function fetchAllConversions(
  customerId: string,
  headers: HeadersInit
): Promise<{ rows: GoogleAdsConversionRow[]; error: string | null }> {
  const rows: GoogleAdsConversionRow[] = []
  let pageToken: string | undefined

  do {
    const body: Record<string, string> = { query: GAQL }
    if (pageToken) body.pageToken = pageToken

    const url = `${BASE_URL}/customers/${customerId}/googleAds:search`
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })

    let json: GoogleAdsSearchResponse
    try {
      json = await res.clone().json()
    } catch {
      const text = await res.text().catch(() => '(unreadable)')
      return { rows, error: `Google Ads API HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    if (!res.ok || json.error) {
      const msg =
        json.error?.details?.[0]?.errors?.[0]?.message ??
        json.error?.message ??
        `HTTP ${res.status}`
      console.log('[v0] Google Ads API error:', msg, '| full body:', JSON.stringify(json).slice(0, 500))
      return { rows, error: msg }
    }

    // Debug: log the raw structure of the first result to verify field names
    if (rows.length === 0 && json.results && json.results.length > 0) {
      console.log('[v0] First raw result from Google Ads:', JSON.stringify(json.results[0]))
    }
    console.log('[v0] Google Ads page results count:', json.results?.length ?? 0)

    rows.push(...(json.results ?? []))
    pageToken = json.nextPageToken
  } while (pageToken)

  return { rows, error: null }
}

function normalizeRows(rows: GoogleAdsConversionRow[]): ConversionResult[] {
  // Aggregate conversions by action name (multiple rows per action due to campaign segmentation)
  const map = new Map<string, ConversionResult>()

  for (const row of rows) {
    // REST API returns camelCase; guard with snake_case fallback
    const name =
      row.segments?.conversionActionName ??
      row.segments?.conversion_action_name ??
      'Sin nombre'
    const action =
      row.segments?.conversionAction ??
      row.segments?.conversion_action ??
      ''

    // Use allConversions when conversions is 0 or missing (e.g. view-through only)
    const conversionsRaw = row.metrics?.conversions
    const allConversionsRaw = row.metrics?.allConversions ?? row.metrics?.all_conversions
    const count = parseFloat(String(conversionsRaw ?? 0)) || parseFloat(String(allConversionsRaw ?? 0))

    if (name === 'Sin nombre') {
      console.log('[v0] Row with no conversion name:', JSON.stringify(row))
    }

    const existing = map.get(name)
    if (existing) {
      existing.conversions += count
    } else {
      map.set(name, { conversionName: name, conversionAction: action, conversions: count })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.conversions - a.conversions)
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const customerId = (body.customerId as string | undefined)?.replace(/-/g, '')

    if (!customerId) {
      return NextResponse.json({ error: 'customerId requerido' }, { status: 400 })
    }

    const accessToken = await getAccessToken()
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No se encontro el access token de Google. Reconectá tu cuenta de Google Ads.' },
        { status: 401 }
      )
    }

    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN no configurado' }, { status: 500 })
    }

    const headers = buildHeaders(accessToken)
    const { rows, error } = await fetchAllConversions(customerId, headers)

    if (error) {
      return NextResponse.json({ error }, { status: 502 })
    }

    const conversions = normalizeRows(rows)
    return NextResponse.json({ conversions, total: conversions.reduce((s, r) => s + r.conversions, 0) })
  } catch (err) {
    console.error('[google-ads/conversions] Unexpected error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
