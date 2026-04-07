import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_ADS_API_VERSION = 'v23'
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`
const MCC_CUSTOMER_ID = '4435948073'

async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.provider_token) return session.provider_token

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const { data: tokenRow } = await supabase
      .from('platform_tokens')
      .select('refresh_token')
      .eq('platform', 'google_ads')
      .maybeSingle()

    const refreshToken = tokenRow?.refresh_token ?? process.env.GOOGLE_ADS_REFRESH_TOKEN ?? null
    if (!refreshToken || !clientId || !clientSecret) return null

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

interface CustomerClientRow {
  customerClient?: {
    id?: string
    descriptiveName?: string
    descriptive_name?: string
    currencyCode?: string
    currency_code?: string
    status?: string
    level?: number
    manager?: boolean
    testAccount?: boolean
    test_account?: boolean
  }
  customer_client?: {
    id?: string
    descriptive_name?: string
    currency_code?: string
    status?: string
    level?: number
    manager?: boolean
    test_account?: boolean
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = await getAccessToken()
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN

  if (!accessToken) {
    return NextResponse.json(
      { error: 'No access token. El usuario debe autorizar Google Ads desde Plataformas.' },
      { status: 401 }
    )
  }
  if (!developerToken) {
    return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN no configurado.' }, { status: 500 })
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'login-customer-id': MCC_CUSTOMER_ID,
  }

  // Single GAQL query on the MCC that returns all sub-accounts via customer_client
  // level 0 = the MCC itself, level 1 = direct sub-accounts, level 2+ = nested
  // manager = true means it's a manager (MCC) account — we skip those
  const gaql = `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.status,
      customer_client.level,
      customer_client.manager,
      customer_client.test_account
    FROM customer_client
    WHERE customer_client.manager = false
      AND customer_client.status != 'CANCELED'
    ORDER BY customer_client.descriptive_name
  `

  const searchRes = await fetch(
    `${GOOGLE_ADS_BASE_URL}/customers/${MCC_CUSTOMER_ID}/googleAds:search`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: gaql }),
    }
  )

  if (!searchRes.ok) {
    const text = await searchRes.text().catch(() => '')
    // Fallback: try listAccessibleCustomers
    const fallbackRes = await fetch(`${GOOGLE_ADS_BASE_URL}/customers:listAccessibleCustomers`, {
      method: 'GET',
      headers,
    })
    if (!fallbackRes.ok) {
      return NextResponse.json(
        { error: `Google Ads API error ${searchRes.status}: ${text.slice(0, 400)}` },
        { status: searchRes.status }
      )
    }
    const fallbackData = await fallbackRes.json() as { resourceNames?: string[] }
    const accounts = (fallbackData.resourceNames ?? []).map(r => ({
      id: r.replace('customers/', ''),
      name: `Cuenta ${r.replace('customers/', '')}`,
      currency: 'ARS',
      status: 'ENABLED',
      is_active: true,
      level: 1,
    }))
    return NextResponse.json({ accounts, source: 'fallback' })
  }

  const data = await searchRes.json() as { results?: CustomerClientRow[] }
  const rows: CustomerClientRow[] = data.results ?? []

  const accounts = rows
    .map(row => {
      // Handle both camelCase and snake_case field naming from the API
      const cc = row.customerClient ?? row.customer_client
      if (!cc) return null

      const id = String(cc.id ?? '')
      if (!id) return null

      const name = (cc as { descriptiveName?: string }).descriptiveName
        ?? cc.descriptive_name
        ?? `Cuenta ${id}`
      const currency = (cc as { currencyCode?: string }).currencyCode
        ?? cc.currency_code
        ?? 'ARS'
      const status = cc.status ?? 'ENABLED'
      const level = cc.level ?? 1
      const isTest = (cc as { testAccount?: boolean }).testAccount ?? cc.test_account ?? false

      return {
        id,
        name,
        currency,
        status,
        level,
        is_active: status === 'ENABLED',
        is_test: isTest,
      }
    })
    .filter(Boolean) as Array<{
      id: string
      name: string
      currency: string
      status: string
      level: number
      is_active: boolean
      is_test: boolean
    }>

  // Sort: active first, then alphabetically
  accounts.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return a.name.localeCompare(b.name, 'es')
  })

  return NextResponse.json({ accounts, total: accounts.length })
}
