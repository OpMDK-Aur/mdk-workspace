import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { safeReturnPath } from '@/lib/google/return-path'
import { GOOGLE_ANALYTICS_PLATFORM } from '@/lib/google-analytics/auth'

const STATE_COOKIE = 'ga_oauth_state'

function sameNonce(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  const [nonce = '', encodedReturn = ''] = (requestUrl.searchParams.get('state') ?? '').split('.')
  const returnTo = safeReturnPath(encodedReturn ? Buffer.from(encodedReturn, 'base64url').toString() : null) ?? '/dashboard/platform'
  const back = (params: Record<string, string>) => {
    const url = new URL(returnTo, appUrl)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const response = NextResponse.redirect(url)
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/auth/google-analytics' })
    return response
  }

  const expectedNonce = request.cookies.get(STATE_COOKIE)?.value
  if (!expectedNonce || !nonce || !sameNonce(nonce, expectedNonce)) return back({ error: 'ga_state' })
  if (requestUrl.searchParams.get('error')) return back({ error: 'ga_denied' })
  const code = requestUrl.searchParams.get('code')
  if (!code) return back({ error: 'ga_no_code' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', appUrl))

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return back({ error: 'ga_config' })

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${appUrl}/api/auth/google-analytics/callback`, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok || tokens.error) {
      console.error('[google-analytics-callback] Token exchange failed:', tokens.error)
      return back({ error: 'ga_token' })
    }
    if (!String(tokens.scope ?? '').includes('analytics.readonly')) return back({ error: 'ga_scope' })
    if (!tokens.refresh_token) return back({ error: 'ga_no_refresh' })

    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((response) => response.json()).catch(() => ({}))

    const admin = createAdminClient()
    // Una conexión de Analytics por usuario: reconectar reemplaza la anterior.
    const { error: deleteError } = await admin.from('plataformas_tokens').delete().eq('plataforma', GOOGLE_ANALYTICS_PLATFORM).eq('cliente_id', user.id)
    if (deleteError) throw new Error(deleteError.message)
    const now = new Date().toISOString()
    const { error: insertError } = await admin.from('plataformas_tokens').insert({
      cliente_id: user.id,
      plataforma: GOOGLE_ANALYTICS_PLATFORM,
      nombre_cuenta: 'Google Analytics',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      email_conectado: userInfo.email ?? null,
      scope: tokens.scope ?? null,
      activo: true,
      created_at: now,
      updated_at: now,
    })
    if (insertError) throw new Error(insertError.message)
    return back({ connected: GOOGLE_ANALYTICS_PLATFORM })
  } catch (error) {
    console.error('[google-analytics-callback] Error:', error instanceof Error ? error.message : error)
    return back({ error: 'ga_save' })
  }
}
