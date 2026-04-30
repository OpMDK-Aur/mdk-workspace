import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || 'v23'}`

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accessToken, error: tokenError } = await getGoogleAdsAccessToken()
  const developerToken = getGoogleAdsDeveloperToken()
  const loginCustomerId = getGoogleAdsLoginCustomerId()

  if (!accessToken) return NextResponse.json({ error: tokenError || 'No se pudo obtener el access token de Google Ads.' })
  if (!developerToken) return NextResponse.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not set' })

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'login-customer-id': loginCustomerId,
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
