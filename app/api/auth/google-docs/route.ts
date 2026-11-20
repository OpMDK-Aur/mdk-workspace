import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeReturnPath } from '@/lib/google/return-path'
import {
  GOOGLE_DOCS_SCOPES,
  GOOGLE_DOCS_STATE_COOKIE,
  GOOGLE_DOCS_STATE_COOKIE_PATH,
  GOOGLE_DOCS_STATE_PREFIX,
  googleDocsRedirectUri,
} from '@/lib/google/docs-oauth'

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
  authUrl.searchParams.set('redirect_uri', googleDocsRedirectUri(appUrl))
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GOOGLE_DOCS_SCOPES.join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent select_account')
  authUrl.searchParams.set('state', `${GOOGLE_DOCS_STATE_PREFIX}${nonce}:${returnTo}`)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set(GOOGLE_DOCS_STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: GOOGLE_DOCS_STATE_COOKIE_PATH, maxAge: 600 })
  return response
}
