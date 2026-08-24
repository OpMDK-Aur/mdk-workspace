import { createClient } from '@/lib/supabase/server'
import { updateAdvertisingAccountName } from '@/lib/ai/repositories/advertising-account-repository'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

export type SyncSummary = { processed: number; created: number; updated: number; unchanged: number; failed: number; errors: string[] }

type ClientRow = { id: string; meta_ads_account_id: unknown; meta_ads_account_ids: unknown; google_ads_customer_id: unknown; google_ads_customer_ids: unknown }

function parseIds(single: unknown, plural: unknown) {
  const values: unknown[] = []
  const visit = (value: unknown) => {
    if (value === null || value === undefined || value === '') return
    if (Array.isArray(value)) return value.forEach(visit)
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed !== trimmed) return visit(parsed)
      } catch {
        // Comma-separated legacy values are supported below.
      }
      return trimmed.split(',').forEach((part) => visit(part))
    }
    values.push(value)
  }
  visit(plural)
  if (!values.length) visit(single)
  return [...new Set(values.map(String).map((id) => id.trim()).filter(Boolean))]
}

async function fetchName(platform: 'meta' | 'google', id: string) {
  if (platform === 'meta') {
    const token = process.env.META_ADS_ACCESS_TOKEN
    if (!token) return null
    const clean = id.replace(/^act_/, '')
    const response = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v25.0'}/act_${clean}?fields=name&access_token=${token}`)
    const data = await response.json()
    if (!response.ok) throw new Error(`Meta HTTP ${response.status}: ${String(data?.error?.message || data?.error?.type || 'respuesta inválida').slice(0, 240)}`)
    return typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null
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
  if (!response.ok) {
    const detail = data?.error?.details?.[0]?.errors?.[0]?.message || data?.error?.message || 'respuesta inválida'
    throw new Error(`Google Ads HTTP ${response.status}: ${String(detail).slice(0, 240)}`)
  }
  const name = data.results?.[0]?.customer?.descriptiveName || data.results?.[0]?.customer?.descriptive_name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

export async function syncAllAdvertisingAccounts(): Promise<SyncSummary> {
  const supabase = await createClient()
  const summary: SyncSummary = { processed: 0, created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] }
  const { data: clients, error } = await supabase.from('clientes').select('id, meta_ads_account_id, meta_ads_account_ids, google_ads_customer_id, google_ads_customer_ids').eq('activo', true)
  if (error) throw new Error(error.message)
  console.log('[v0] Advertising account sync clients loaded:', { clients: clients?.length ?? 0 })

  for (const client of (clients || []) as ClientRow[]) {
    for (const platform of ['meta', 'google'] as const) {
      const ids = platform === 'meta' ? parseIds(client.meta_ads_account_id, client.meta_ads_account_ids) : parseIds(client.google_ads_customer_id, client.google_ads_customer_ids)
      console.log('[v0] Advertising account sync platform:', { clientId: client.id, platform, configuredIds: ids.length })
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
