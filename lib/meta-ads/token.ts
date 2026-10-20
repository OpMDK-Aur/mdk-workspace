import 'server-only'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

export const META_PLATFORM_KEY = 'meta_ads'
export const META_GRAPH_VERSION = process.env.META_API_VERSION || 'v25.0'
// Public app ID of the MDK Meta app; used when META_APP_ID is empty in an environment.
export const META_APP_ID = process.env.META_APP_ID?.trim() || '2405118353337553'

export const META_OAUTH_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'ads_management',
  'ads_read',
  'read_insights',
  'business_management',
]

const CACHE_TTL_MS = 60_000
let cached: { token: string | null; at: number } | null = null

async function readStoredToken(): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('plataformas_tokens')
      .select('access_token, token_expiry')
      .eq('plataforma', META_PLATFORM_KEY)
      .eq('activo', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data?.access_token) return null
    if (data.token_expiry && new Date(data.token_expiry).getTime() < Date.now()) return null
    return data.access_token as string
  } catch {
    return null
  }
}

/** Token reconnected from Apps takes priority; META_ADS_ACCESS_TOKEN stays as fallback. */
export async function getMetaAccessToken(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.token
  const token = (await readStoredToken()) ?? process.env.META_ADS_ACCESS_TOKEN ?? null
  cached = { token, at: Date.now() }
  return token
}

export function clearMetaTokenCache() {
  cached = null
}
