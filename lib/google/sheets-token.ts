import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

export type GoogleSheetsAccess = { accessToken: string; email: string | null } | { error: 'unauthenticated' | 'not_connected' | 'expired' }

const REFRESH_BUFFER_MS = 5 * 60 * 1000

// Token del OAuth "google_sheets" (scopes spreadsheets + drive) del usuario logueado; se renueva si está por vencer.
export async function getGoogleSheetsAccess(): Promise<GoogleSheetsAccess> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' }

  const admin = createAdminClient()
  const { data: token } = await admin
    .from('plataformas_tokens')
    .select('access_token, refresh_token, token_expiry, email_conectado')
    .eq('plataforma', 'google_sheets')
    .eq('cliente_id', user.id)
    .eq('activo', true)
    .maybeSingle()
  if (!token?.access_token) return { error: 'not_connected' }

  const email = token.email_conectado ?? null
  if (new Date(token.token_expiry).getTime() > Date.now() + REFRESH_BUFFER_MS) return { accessToken: token.access_token, email }
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
    .eq('plataforma', 'google_sheets')
    .eq('cliente_id', user.id)

  return { accessToken: refreshed.access_token, email }
}
