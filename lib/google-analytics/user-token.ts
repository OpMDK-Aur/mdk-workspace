import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

export const GOOGLE_ANALYTICS_PLATFORM = 'google_analytics'
export const GOOGLE_ANALYTICS_STATE_COOKIE = 'ga_oauth_state'

export type GoogleAnalyticsAccess =
  | { accessToken: string; email: string | null; userId: string }
  | { error: 'unauthenticated' | 'not_connected' | 'expired' }

const REFRESH_BUFFER_MS = 5 * 60 * 1000

/**
 * Token del OAuth "google_analytics" (scope analytics.readonly) de un usuario de MDK.
 * Sin `userId` usa el usuario de la sesión actual. Se renueva si está por vencer.
 */
export async function getGoogleAnalyticsAccess(userId?: string): Promise<GoogleAnalyticsAccess> {
  let resolvedUserId = userId
  if (!resolvedUserId) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'unauthenticated' }
    resolvedUserId = user.id
  }

  const admin = createAdminClient()
  const { data: token } = await admin
    .from('plataformas_tokens')
    .select('access_token, refresh_token, token_expiry, email_conectado')
    .eq('plataforma', GOOGLE_ANALYTICS_PLATFORM)
    .eq('cliente_id', resolvedUserId)
    .eq('activo', true)
    .maybeSingle()
  if (!token?.access_token) return { error: 'not_connected' }

  const email = token.email_conectado ?? null
  if (new Date(token.token_expiry).getTime() > Date.now() + REFRESH_BUFFER_MS) return { accessToken: token.access_token, email, userId: resolvedUserId }
  if (!token.refresh_token || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return { error: 'expired' }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const refreshed = await response.json().catch(() => null)
  if (!response.ok || !refreshed?.access_token) return { error: 'expired' }

  await admin
    .from('plataformas_tokens')
    .update({
      access_token: refreshed.access_token,
      token_expiry: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('plataforma', GOOGLE_ANALYTICS_PLATFORM)
    .eq('cliente_id', resolvedUserId)

  return { accessToken: refreshed.access_token, email, userId: resolvedUserId }
}

/** Token del usuario si conectó su Google Analytics; `null` si no (se usa la conexión compartida). */
export async function getOptionalGoogleAnalyticsToken(userId?: string) {
  const access = await getGoogleAnalyticsAccess(userId).catch(() => null)
  return access && 'accessToken' in access ? access.accessToken : null
}
