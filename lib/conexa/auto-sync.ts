import { google } from 'googleapis'
import { getMetaAccessToken } from '@/lib/meta-ads/token'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'
import { listAllTagManagerAccounts } from '@/lib/google-tag-manager/service'

export type FoundAccount = { id: string; name: string }
export type AutoSyncMatches = { meta: FoundAccount[]; google: FoundAccount[]; analytics: FoundAccount[]; tagManager: FoundAccount[]; errors: string[] }

const META_BASE_URL = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v25.0'}`
const GOOGLE_ADS_BASE_URL = 'https://googleads.googleapis.com/v23'

/** Sin tildes, minúsculas y solo letras/números separados por un espacio. */
export const normalizeName = (value: string | null | undefined) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * La cuenta coincide si su nombre es igual al del cliente o lo contiene como
 * palabras completas ("ADT - Conversiones" coincide con "ADT"). Se exige un
 * nombre de al menos 3 caracteres para no vincular cuentas por siglas sueltas.
 */
export function nameMatches(clientName: string, accountName: string) {
  const client = normalizeName(clientName)
  const account = normalizeName(accountName)
  if (client.length < 3 || !account) return false
  return account === client || ` ${account} `.includes(` ${client} `)
}

async function findMeta(clientName: string): Promise<FoundAccount[]> {
  const token = await getMetaAccessToken()
  if (!token) throw new Error('Meta Ads: falta el token.')
  const found: FoundAccount[] = []
  let url: string | null = `${META_BASE_URL}/me/adaccounts?${new URLSearchParams({ access_token: token, fields: 'account_id,name,account_status', limit: '200' })}`
  for (let page = 0; url && page < 20; page++) {
    const response: Response = await fetch(url, { cache: 'no-store' })
    const json = await response.json() as { data?: Array<{ account_id?: string; name?: string; account_status?: number }>; paging?: { next?: string }; error?: { message?: string } }
    if (json.error) throw new Error(`Meta Ads: ${json.error.message ?? 'error de la API'}`)
    for (const account of json.data ?? []) if (account.account_id && account.account_status === 1 && nameMatches(clientName, account.name ?? '')) found.push({ id: account.account_id, name: account.name ?? account.account_id })
    url = json.paging?.next ?? null
  }
  return found
}

async function findGoogleAds(clientName: string): Promise<FoundAccount[]> {
  const { accessToken, error } = await getGoogleAdsAccessToken()
  const developerToken = getGoogleAdsDeveloperToken()
  if (!accessToken || !developerToken) throw new Error(`Google Ads: ${error ?? 'faltan credenciales.'}`)
  const loginCustomerId = getGoogleAdsLoginCustomerId()
  const response = await fetch(`${GOOGLE_ADS_BASE_URL}/customers/${loginCustomerId}/googleAds:search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken, 'login-customer-id': loginCustomerId },
    body: JSON.stringify({ query: "SELECT customer_client.id, customer_client.descriptive_name, customer_client.status FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'" }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Google Ads: error ${response.status}`)
  const json = await response.json() as { results?: Array<{ customerClient?: { id?: string; descriptiveName?: string } }> }
  return (json.results ?? []).flatMap(({ customerClient }) => customerClient?.id && nameMatches(clientName, customerClient.descriptiveName ?? '') ? [{ id: String(customerClient.id), name: customerClient.descriptiveName ?? String(customerClient.id) }] : [])
}

async function findAnalytics(clientName: string): Promise<FoundAccount[]> {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
  const admin = google.analyticsadmin({ version: 'v1beta', auth })
  const found: FoundAccount[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 10; page++) {
    const { data } = await admin.accountSummaries.list({ pageSize: 200, pageToken })
    for (const account of data.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        const id = property.property?.replace('properties/', '') ?? ''
        if (id && (nameMatches(clientName, property.displayName ?? '') || nameMatches(clientName, account.displayName ?? ''))) found.push({ id, name: property.displayName ?? id })
      }
    }
    pageToken = data.nextPageToken ?? undefined
    if (!pageToken) break
  }
  return found
}

async function findTagManager(clientName: string): Promise<FoundAccount[]> {
  const result = await listAllTagManagerAccounts()
  if (!result.ok) throw new Error(`Tag Manager: ${result.error}`)
  return result.accounts.filter((container) => container.containerId && (nameMatches(clientName, container.containerName) || nameMatches(clientName, container.accountName))).map((container) => ({ id: container.containerId, name: `${container.containerName}${container.publicId ? ` (${container.publicId})` : ''}` }))
}

/** Busca, por nombre del cliente, cuentas en Meta Ads, Google Ads, GA4 y Tag Manager a las que Conexa tiene acceso. */
export async function findAccountsByClientName(clientName: string): Promise<AutoSyncMatches> {
  const errors: string[] = []
  const safe = (promise: Promise<FoundAccount[]>) => promise.catch((error) => { errors.push(error instanceof Error ? error.message : String(error)); return [] as FoundAccount[] })
  const [meta, googleAds, analytics, tagManager] = await Promise.all([safe(findMeta(clientName)), safe(findGoogleAds(clientName)), safe(findAnalytics(clientName)), safe(findTagManager(clientName))])
  return { meta, google: googleAds, analytics, tagManager, errors }
}
