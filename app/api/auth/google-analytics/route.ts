import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { safeReturnPath } from '@/lib/google/return-path'
import {
  GOOGLE_ANALYTICS_PLATFORM,
  GOOGLE_ANALYTICS_STATE_COOKIE as STATE_COOKIE,
  GOOGLE_ANALYTICS_STATE_COOKIE_PATH,
  GOOGLE_ANALYTICS_STATE_PREFIX,
  googleAnalyticsRedirectUri,
} from '@/lib/google-analytics/user-token'

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const requestUrl = new URL(request.url)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID no está configurado' }, { status: 500 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', appUrl))

  const nonce = randomBytes(16).toString('hex')
  const returnTo = safeReturnPath(requestUrl.searchParams.get('return')) ?? '/dashboard/apps'

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', googleAnalyticsRedirectUri(appUrl))
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/userinfo.email', 'openid'].join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent select_account')
  authUrl.searchParams.set('include_granted_scopes', 'true')
  authUrl.searchParams.set('state', `${GOOGLE_ANALYTICS_STATE_PREFIX}${nonce}:${returnTo}`)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set(STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: GOOGLE_ANALYTICS_STATE_COOKIE_PATH, maxAge: 600 })
  return response
}

/** Desconecta el Google Analytics del usuario logueado. */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { error } = await createAdminClient().from('plataformas_tokens').delete().eq('plataforma', GOOGLE_ANALYTICS_PLATFORM).eq('cliente_id', user.id)
  if (error) return NextResponse.json({ error: 'No se pudo desconectar Google Analytics' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
