import { createClient } from '@/lib/supabase/server'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'
import { NextRequest, NextResponse } from 'next/server'

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const GOOGLE_ADS_API_VERSION = 'v23'

// Igual que en el resto del sistema: meta_ads_account_id(s) / google_ads_customer_id(s)
// en `clientes` pueden ser un array o un string separado por comas.
function parseIds(single: unknown, plural: unknown): string[] {
  if (Array.isArray(plural) && plural.length > 0) return plural.map((v) => String(v).trim()).filter(Boolean)
  if (typeof plural === 'string' && plural.length > 0) return plural.split(',').map((v) => v.trim()).filter(Boolean)
  if (Array.isArray(single) && single.length > 0) return single.map((v) => String(v).trim()).filter(Boolean)
  if (typeof single === 'string' && single.length > 0) return single.split(',').map((v) => v.trim()).filter(Boolean)
  return []
}

async function getMetaAccountName(id: string, accessToken: string): Promise<string> {
  try {
    const cleanId = id.replace('act_', '')
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/act_${cleanId}?fields=name&access_token=${accessToken}`)
    const data = await res.json()
    if (res.ok && data.name) return data.name
  } catch {
    // ignore, cae al fallback
  }
  return id
}

async function getGoogleAccountName(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<string> {
  try {
    const cleanId = customerId.replace(/-/g, '')
    const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanId}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'SELECT customer.descriptive_name FROM customer' }),
    })
    const data = await res.json()
    const customer = data.results?.[0]?.customer
    const name = customer?.descriptiveName || customer?.descriptive_name
    if (res.ok && name) return name
  } catch {
    // ignore, cae al fallback
  }
  return customerId
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: client, error } = await supabase
    .from('clientes')
    .select('meta_ads_account_id, meta_ads_account_ids, google_ads_customer_id, google_ads_customer_ids')
    .eq('id', clientId)
    .single()

  if (error || !client) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  const metaIds = parseIds(client.meta_ads_account_id, client.meta_ads_account_ids)
  const googleIds = parseIds(client.google_ads_customer_id, client.google_ads_customer_ids)

  const cuentas: Array<{ id: string; plataforma: 'meta' | 'google'; id_cuenta: string; nombre_cuenta: string }> = []

  const metaAccessToken = process.env.META_ADS_ACCESS_TOKEN
  if (metaIds.length > 0 && metaAccessToken) {
    const nombres = await Promise.all(metaIds.map((id) => getMetaAccountName(id, metaAccessToken)))
    metaIds.forEach((id, i) => cuentas.push({ id: `meta-${id}`, plataforma: 'meta', id_cuenta: id, nombre_cuenta: nombres[i] }))
  } else {
    metaIds.forEach((id) => cuentas.push({ id: `meta-${id}`, plataforma: 'meta', id_cuenta: id, nombre_cuenta: id }))
  }

  if (googleIds.length > 0) {
    const { accessToken } = await getGoogleAdsAccessToken()
    const developerToken = getGoogleAdsDeveloperToken()
    const loginCustomerId = getGoogleAdsLoginCustomerId()
    if (accessToken && developerToken) {
      const nombres = await Promise.all(
        googleIds.map((id) => getGoogleAccountName(id, accessToken, developerToken, loginCustomerId))
      )
      googleIds.forEach((id, i) => cuentas.push({ id: `google-${id}`, plataforma: 'google', id_cuenta: id, nombre_cuenta: nombres[i] }))
    } else {
      googleIds.forEach((id) => cuentas.push({ id: `google-${id}`, plataforma: 'google', id_cuenta: id, nombre_cuenta: id }))
    }
  }

  return NextResponse.json({ cuentas })
}