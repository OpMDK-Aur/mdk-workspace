import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeReturnPath } from '@/lib/google/return-path'

export const STATE_COOKIE = 'ga_oauth_state'

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const requestUrl = new URL(request.url)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', appUrl))

  // El state viaja a Google y vuelve; la cookie confirma que el callback lo inició este navegador.
  const nonce = randomBytes(24).toString('base64url')
  const returnTo = safeReturnPath(requestUrl.searchParams.get('return')) ?? '/dashboard/platform'

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', `${appUrl}/api/auth/google-analytics/callback`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/userinfo.email'].join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent select_account')
  authUrl.searchParams.set('include_granted_scopes', 'true')
  authUrl.searchParams.set('state', `${nonce}.${Buffer.from(returnTo).toString('base64url')}`)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set(STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth/google-analytics', maxAge: 600 })
  return response
}
