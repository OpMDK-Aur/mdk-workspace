import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || 'v19'}`

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  let refreshToken: string | null = null

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('platform_tokens')
      .select('refresh_token')
      .eq('platform', 'google_ads')
      .single()
    refreshToken = data?.refresh_token ?? null
  } catch { /* ignore */ }

  if (!refreshToken) refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN ?? null
  if (!refreshToken || !clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const data = await res.json()
  return data.access_token ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessToken = await getAccessToken()
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '')

  if (!accessToken) return NextResponse.json({ error: 'No access token. Check GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' })
  if (!developerToken) return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not set' })

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  }

  // List accessible customers
  const listRes = await fetch(`${GOOGLE_ADS_BASE_URL}/customers:listAccessibleCustomers`, {
    method: 'GET',
    headers,
  })
  const listText = await listRes.text()
  let listJson: unknown
  try { listJson = JSON.parse(listText) } catch { listJson = listText }

  return NextResponse.json({
    accessToken: accessToken ? `${accessToken.slice(0, 20)}...` : null,
    developerToken: developerToken ? `${developerToken.slice(0, 8)}...` : null,
    loginCustomerId: loginCustomerId ?? null,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || 'v19',
    listAccessibleCustomers: {
      status: listRes.status,
      body: listJson,
    },
  })
}
