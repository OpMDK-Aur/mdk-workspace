import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { safeReturnPath } from '@/lib/google/return-path'

export const GOOGLE_DOCS_PLATFORM = 'google_docs'
export const GOOGLE_DOCS_STATE_COOKIE = 'gdocs_oauth_state'
export const GOOGLE_DOCS_STATE_COOKIE_PATH = '/api/auth'
/** Prefijo del state que distingue la conexión de Docs de la de Sheets en el callback compartido. */
export const GOOGLE_DOCS_STATE_PREFIX = 'gdocs:'
export const GOOGLE_DOCS_SCOPES = [
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
]

/**
 * Usa la URL de vuelta de Google Sheets, que ya está autorizada en el cliente
 * OAuth. Una URL nueva sin registrar hace que Google muestre "Acceso bloqueado".
 */
export function googleDocsRedirectUri(appUrl: string) {
  return `${appUrl}/api/auth/google-sheets/callback`
}

export function isGoogleDocsState(state: string | null) {
  return Boolean(state?.startsWith(GOOGLE_DOCS_STATE_PREFIX))
}

function withStatus(path: string, key: string, value: string, appUrl: string) {
  const url = new URL(path, appUrl)
  url.searchParams.set(key, value)
  return url
}

export async function handleGoogleDocsCallback(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  const [nonce, ...rest] = (requestUrl.searchParams.get('state') ?? '').slice(GOOGLE_DOCS_STATE_PREFIX.length).split(':')
  const returnTo = safeReturnPath(rest.join(':')) ?? '/dashboard/apps'
  const finish = (key: string, value: string) => {
    const response = NextResponse.redirect(withStatus(returnTo, key, value, appUrl))
    response.cookies.delete({ name: GOOGLE_DOCS_STATE_COOKIE, path: GOOGLE_DOCS_STATE_COOKIE_PATH })
    return response
  }
  const fail = (reason: string) => finish('error', `google_docs_${reason}`)

  const expectedNonce = request.cookies.get(GOOGLE_DOCS_STATE_COOKIE)?.value
  if (!nonce || !expectedNonce || nonce !== expectedNonce) return fail('state')
  if (requestUrl.searchParams.get('error')) return fail('denied')
  const code = requestUrl.searchParams.get('code')
  if (!code) return fail('no_code')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return fail('config')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: googleDocsRedirectUri(appUrl), grant_type: 'authorization_code' }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok || tokens.error) {
      console.error('[google-docs-callback] Token exchange failed:', tokens.error)
      return fail('token')
    }
    if (!String(tokens.scope ?? '').includes('documents.readonly')) return fail('scope')

    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((response) => response.json()).catch(() => ({}))
    const admin = createAdminClient()
    await admin.from('plataformas_tokens').delete().eq('plataforma', GOOGLE_DOCS_PLATFORM).eq('cliente_id', user.id)
    const now = new Date().toISOString()
    const { error: dbError } = await admin.from('plataformas_tokens').insert({
      cliente_id: user.id,
      plataforma: GOOGLE_DOCS_PLATFORM,
      nombre_cuenta: 'Google Docs',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      email_conectado: userInfo.email || null,
      scope: tokens.scope || null,
      activo: true,
      created_at: now,
      updated_at: now,
    })
    if (dbError) {
      console.error('[google-docs-callback] DB error:', dbError.message)
      return fail('db')
    }
    return finish('connected', GOOGLE_DOCS_PLATFORM)
  } catch (error) {
    console.error('[google-docs-callback] Error:', error instanceof Error ? error.message : error)
    return fail('unknown')
  }
}
