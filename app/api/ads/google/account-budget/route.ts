import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

export const dynamic = 'force-dynamic'

const GOOGLE_ADS_API_VERSION = 'v23'
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

export interface AccountBudgetResult {
  accountBudgetId: string
  accountName: string
  status: string
  billingSetup: string
  limiteAprobado: number
  limiteAjustado: number
  montoServido: number
  saldoDisponible: number
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = request.nextUrl.searchParams.get('customer_id')
  if (!customerId) return NextResponse.json({ error: 'customer_id es requerido' }, { status: 400 })

  const cleanCustomerId = customerId.replace(/-/g, '')

  const { accessToken, error: tokenError } = await getGoogleAdsAccessToken()
  const developerToken = getGoogleAdsDeveloperToken()
  const loginCustomerId = getGoogleAdsLoginCustomerId()

  if (!accessToken) {
    return NextResponse.json({
      error: tokenError || 'No se pudo obtener el access token de Google Ads.',
      tokenExpired: true,
    }, { status: 401 })
  }
  if (!developerToken) {
    return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN no configurado.' }, { status: 500 })
  }

  const headers: Record<string, string> = {
    'Authorization':     `Bearer ${accessToken}`,
    'developer-token':   developerToken,
    'login-customer-id': loginCustomerId,
    'Content-Type':      'application/json',
  }

  const query = `
    SELECT
      account_budget.id,
      account_budget.status,
      account_budget.billing_setup,
      account_budget.approved_spending_limit_micros,
      account_budget.adjusted_spending_limit_micros,
      account_budget.amount_served_micros,
      customer.descriptive_name
    FROM account_budget
    WHERE account_budget.status = 'APPROVED'
    ORDER BY account_budget.id DESC
    LIMIT 1
  `.trim()

  // Use searchStream for account_budget resource
  const url = `${GOOGLE_ADS_BASE_URL}/customers/${cleanCustomerId}/googleAds:searchStream`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
    cache: 'no-store',
  })

  if (!res.ok) {
    let msg = `Google Ads API HTTP ${res.status}`
    let isTokenError = false
    try {
      const body = await res.json()
      msg = body?.error?.details?.[0]?.errors?.[0]?.message
        ?? body?.error?.message
        ?? msg
      // Check if error is related to authentication
      const errorLower = msg.toLowerCase()
      if (errorLower.includes('token') || errorLower.includes('auth') || errorLower.includes('expired') || errorLower.includes('unauthorized') || res.status === 401) {
        isTokenError = true
      }
    } catch { /* ignore */ }
    return NextResponse.json({ error: msg, tokenExpired: isTokenError }, { status: res.status })
  }

  // searchStream returns NDJSON (one JSON object per line)
  const text = await res.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allResults: any[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') continue
    // Strip trailing comma from NDJSON array items
    const clean = trimmed.replace(/,$/, '')
    try {
      const parsed = JSON.parse(clean)
      // Each chunk may be an object with a `results` array, or a plain result object
      if (Array.isArray(parsed)) {
        for (const chunk of parsed) {
          if (chunk?.results) allResults = allResults.concat(chunk.results)
        }
      } else if (parsed?.results) {
        allResults = allResults.concat(parsed.results)
      }
    } catch { /* skip malformed lines */ }
  }

  // Also try parsing the whole body as a JSON array (some versions return that)
  if (allResults.length === 0) {
    try {
      const parsed = JSON.parse(text)
      const chunks = Array.isArray(parsed) ? parsed : [parsed]
      for (const chunk of chunks) {
        if (chunk?.results) allResults = allResults.concat(chunk.results)
      }
    } catch { /* ignore */ }
  }

  if (allResults.length === 0) {
    return NextResponse.json({ data: null, message: 'Sin presupuesto aprobado disponible.' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = allResults[0]
  const ab       = row?.accountBudget ?? row?.account_budget ?? row
  const customer = row?.customer ?? {}

  const accountName = customer?.descriptiveName ?? customer?.descriptive_name ?? ''

  const approvedMicros  = Number(ab?.approvedSpendingLimitMicros ?? ab?.approved_spending_limit_micros ?? 0)
  const adjustedMicros  = Number(ab?.adjustedSpendingLimitMicros ?? ab?.adjusted_spending_limit_micros ?? 0)
  const servedMicros    = Number(ab?.amountServedMicros ?? ab?.amount_served_micros ?? 0)

  const limiteAprobado  = approvedMicros  / 1_000_000
  const limiteAjustado  = adjustedMicros  / 1_000_000
  const montoServido    = servedMicros    / 1_000_000

  // Use adjusted if > 0, otherwise fall back to approved
  const limiteEfectivo  = adjustedMicros > 0 ? limiteAjustado : limiteAprobado
  const saldoDisponible = limiteEfectivo - montoServido

  const result: AccountBudgetResult = {
    accountBudgetId: String(ab?.id ?? ''),
    accountName,
    status:          String(ab?.status ?? ''),
    billingSetup:    String(ab?.billingSetup ?? ab?.billing_setup ?? ''),
    limiteAprobado,
    limiteAjustado,
    montoServido,
    saldoDisponible,
  }

  return NextResponse.json(
    { data: result },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
