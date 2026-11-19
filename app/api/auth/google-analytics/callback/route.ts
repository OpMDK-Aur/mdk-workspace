import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { safeReturnPath } from '@/lib/google/return-path'
import { GOOGLE_ANALYTICS_PLATFORM, GOOGLE_ANALYTICS_STATE_COOKIE as STATE_COOKIE } from '@/lib/google-analytics/user-token'

function withStatus(path: string, key: string, value: string, appUrl: string) {
  const url = new URL(path, appUrl)
  url.searchParams.set(key, value)
  return url
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  const [nonce, ...rest] = (requestUrl.searchParams.get('state') ?? '').split(':')
  const returnTo = safeReturnPath(rest.join(':')) ?? '/dashboard/platform'
  const fail = (reason: string) => {
    const response = NextResponse.redirect(withStatus(returnTo, 'ga_error', reason, appUrl))
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/auth/google-analytics' })
    return response
  }

  const expectedNonce = request.cookies.get(STATE_COOKIE)?.value
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
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${appUrl}/api/auth/google-analytics/callback`, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok || tokens.error) {
      console.error('[google-analytics-callback] Token exchange failed:', tokens.error)
      return fail('token')
    }
    if (!String(tokens.scope ?? '').includes('analytics.readonly')) return fail('scope')

    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((response) => response.json()).catch(() => ({}))
    const admin = createAdminClient()
    await admin.from('plataformas_tokens').delete().eq('plataforma', GOOGLE_ANALYTICS_PLATFORM).eq('cliente_id', user.id)
    const now = new Date().toISOString()
    const { error: dbError } = await admin.from('plataformas_tokens').insert({
      cliente_id: user.id,
      plataforma: GOOGLE_ANALYTICS_PLATFORM,
      nombre_cuenta: 'Google Analytics',
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
      console.error('[google-analytics-callback] DB error:', dbError.message)
      return fail('db')
    }

    const response = NextResponse.redirect(withStatus(returnTo, 'connected', 'google_analytics', appUrl))
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/auth/google-analytics' })
    return response
  } catch (error) {
    console.error('[google-analytics-callback] Error:', error instanceof Error ? error.message : error)
    return fail('unknown')
  }
}
