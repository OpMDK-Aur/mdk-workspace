import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const GOOGLE_ADS_API_VERSION = 'v23'
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

// ---------------------------------------------------------------------------
// Access token — read from platform_tokens table and refresh if expired
// ---------------------------------------------------------------------------
async function getAccessToken(): Promise<{ token: string | null; error?: string; tokenExpired?: boolean }> {
  try {
    const supabase = await createClient()
    
    // Read token from platform_tokens table
    const { data: tokenData, error } = await supabase
      .from('platform_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('platform', 'google_ads')
      .single()
    
    if (error || !tokenData) {
      return { 
        token: null, 
        error: 'No se encontro token de Google Ads. El usuario debe re-autorizar desde Plataformas.',
        tokenExpired: true 
      }
    }
    
    // Check if token is expired or will expire in the next 5 minutes
    const expiryTime = new Date(tokenData.token_expiry).getTime()
    const now = Date.now()
    const bufferMs = 5 * 60 * 1000 // 5 minutes buffer
    
    if (expiryTime > now + bufferMs) {
      // Token is still valid
      return { token: tokenData.access_token }
    }
    
    // Token is expired or expiring soon, refresh it
    if (!tokenData.refresh_token) {
      return { 
        token: null, 
        error: 'Token de Google Ads expirado y sin refresh_token. El usuario debe re-autorizar desde Plataformas.',
        tokenExpired: true 
      }
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      return { token: null, error: 'Faltan las credenciales GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en el servidor.' }
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
      const errorMsg = refreshData.error_description || refreshData.error || 'Error desconocido'
      return { 
        token: null, 
        error: `Error al refrescar token de Google: ${errorMsg}. El usuario debe re-autorizar desde Plataformas.`,
        tokenExpired: true 
      }
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
    
    return { token: refreshData.access_token }
  } catch (e) {
    console.error('[google-ads/account-budget] Error getting access token:', e)
    return { token: null, error: `Error interno al obtener token de Google: ${e}` }
  }
}

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

  const { token: accessToken, error: tokenError, tokenExpired } = await getAccessToken()
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') ?? '4435948073'

  if (!accessToken) {
    // Return specific error for token expiration so UI can show "Token vencido"
    return NextResponse.json({
      error: tokenError || 'No se pudo obtener el access token de Google. El usuario debe re-autorizar Google OAuth desde Plataformas.',
      tokenExpired: tokenExpired ?? false,
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
