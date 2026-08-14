import { createClient } from '@/lib/supabase/server'
import { updateAdvertisingAccountName } from '@/lib/ai/repositories/advertising-account-repository'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

export type SyncSummary = { processed: number; created: number; updated: number; unchanged: number; failed: number; errors: string[] }

type ClientRow = { id: string; meta_ads_account_id: unknown; meta_ads_account_ids: unknown; google_ads_customer_id: unknown; google_ads_customer_ids: unknown }

function parseIds(single: unknown, plural: unknown) {
  const value = Array.isArray(plural) && plural.length ? plural : plural || single
  return (Array.isArray(value) ? value : String(value || '').split(',')).map(String).map((id) => id.trim()).filter(Boolean)
}

async function fetchName(platform: 'meta' | 'google', id: string) {
  if (platform === 'meta') {
    const token = process.env.META_ADS_ACCESS_TOKEN
    if (!token) return null
    const clean = id.replace(/^act_/, '')
    const response = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v25.0'}/act_${clean}?fields=name&access_token=${token}`)
    const data = await response.json()
    return response.ok && typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null
  }
  const { accessToken } = await getGoogleAdsAccessToken()
  const developerToken = getGoogleAdsDeveloperToken()
  const loginCustomerId = getGoogleAdsLoginCustomerId()
  if (!accessToken || !developerToken) return null
  const clean = id.replace(/-/g, '')
  const response = await fetch(`https://googleads.googleapis.com/v23/customers/${clean}/googleAds:search`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken, 'login-customer-id': loginCustomerId, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'SELECT customer.descriptive_name FROM customer' }),
  })
  const data = await response.json()
  const name = data.results?.[0]?.customer?.descriptiveName || data.results?.[0]?.customer?.descriptive_name
  return response.ok && typeof name === 'string' && name.trim() ? name.trim() : null
}

export async function syncAllAdvertisingAccounts(): Promise<SyncSummary> {
  const supabase = await createClient()
  const summary: SyncSummary = { processed: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] }
  const { data: clients, error } = await supabase.from('clientes').select('id, meta_ads_account_id, meta_ads_account_ids, google_ads_customer_id, google_ads_customer_ids').eq('activo', true)
  if (error) throw new Error(error.message)

  for (const client of (clients || []) as ClientRow[]) {
    for (const platform of ['meta', 'google'] as const) {
      const ids = platform === 'meta' ? parseIds(client.meta_ads_account_id, client.meta_ads_account_ids) : parseIds(client.google_ads_customer_id, client.google_ads_customer_ids)
      for (const id of ids) {
        summary.processed++
        try {
          const name = await fetchName(platform, id)
          if (!name) { summary.failed++; summary.errors.push(`${platform}:${id} no devolvió nombre`); continue }
          const result = await updateAdvertisingAccountName(supabase, { clienteId: client.id, plataforma: platform, idCuenta: id, nombreCuenta: name })
          if (result === 'created') summary.created++
          else if (result === 'updated') summary.updated++
          else summary.unchanged++
        } catch (err) { summary.failed++; summary.errors.push(`${platform}:${id} ${err instanceof Error ? err.message : 'error'}`) }
      }
    }
  }
  return summary
}
