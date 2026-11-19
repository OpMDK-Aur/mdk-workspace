import { google } from 'googleapis'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

export const GOOGLE_ANALYTICS_PLATFORM = 'google_analytics'
export const SHARED_SOURCE_ID = 'operaciones'

export type AnalyticsProperty = { propertyId: string; propertyName: string; accountName: string; accountId: string }

/** Una cuenta de Google con acceso a Analytics: la compartida de operaciones o la que conectó un usuario. */
export type AnalyticsSource = { id: string; email: string | null; refreshToken: string }

const CACHE_MS = 5 * 60 * 1000
const propertiesCache = new Map<string, { expiresAt: number; properties: AnalyticsProperty[] }>()

export function oauthClient(refreshToken: string) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

function sharedSource(): AnalyticsSource | null {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  return refreshToken ? { id: SHARED_SOURCE_ID, email: 'operaciones@madketing.io', refreshToken } : null
}

type TokenRow = { id: string; email_conectado: string | null; refresh_token: string | null }

async function connectedSources(userId?: string): Promise<AnalyticsSource[]> {
  let query = createAdminClient()
    .from('plataformas_tokens')
    .select('id, email_conectado, refresh_token')
    .eq('plataforma', GOOGLE_ANALYTICS_PLATFORM)
    .eq('activo', true)
  if (userId) query = query.eq('cliente_id', userId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as TokenRow[])
    .filter((row) => row.refresh_token)
    .map((row) => ({ id: row.id, email: row.email_conectado, refreshToken: row.refresh_token! }))
}

/** Cuenta de operaciones + la cuenta que conectó este usuario (si conectó una). */
export async function getSourcesForUser(userId: string) {
  const shared = sharedSource()
  const own = await connectedSources(userId)
  return { shared, own }
}

export async function listProperties(source: AnalyticsSource): Promise<AnalyticsProperty[]> {
  const cached = propertiesCache.get(source.id)
  if (cached && cached.expiresAt > Date.now()) return cached.properties
  const admin = google.analyticsadmin({ version: 'v1beta', auth: oauthClient(source.refreshToken) })
  const properties: AnalyticsProperty[] = []
  let pageToken: string | undefined
  do {
    const response = await admin.accountSummaries.list({ pageSize: 200, pageToken })
    for (const account of response.data.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        properties.push({
          accountId: account.name?.replace('accountSummaries/', '') ?? '',
          accountName: account.displayName ?? 'Cuenta sin nombre',
          propertyId: property.property?.replace('properties/', '') ?? '',
          propertyName: property.displayName ?? 'Propiedad sin nombre',
        })
      }
    }
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)
  propertiesCache.set(source.id, { expiresAt: Date.now() + CACHE_MS, properties })
  return properties
}

/**
 * Auth para leer una propiedad: primero la cuenta de operaciones y, si no la
 * tiene, la primera cuenta conectada por un usuario que sí tenga acceso.
 */
export async function getAuthForProperty(propertyId: string) {
  const shared = sharedSource()
  const candidates = [...(shared ? [shared] : []), ...(await connectedSources().catch(() => []))]
  for (const source of candidates) {
    try {
      const properties = await listProperties(source)
      if (properties.some((property) => property.propertyId === propertyId)) return oauthClient(source.refreshToken)
    } catch (error) {
      console.error('[google-analytics] No se pudieron listar propiedades de una cuenta conectada:', source.email, error instanceof Error ? error.message : error)
    }
  }
  if (!shared) throw new Error('No hay ninguna cuenta de Google Analytics conectada con acceso a esta propiedad')
  return oauthClient(shared.refreshToken)
}
