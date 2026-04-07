import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/auth/google-ads/callback`
  const sp = request.nextUrl.searchParams
  const code = sp.get('code')
  const error = sp.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=${encodeURIComponent(error || 'no_code')}`, origin)
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/dashboard/platform?error=missing_credentials', origin)
    )
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json()
  console.log('[google-oauth] Token response status:', tokenRes.status, JSON.stringify({ ...tokenData, access_token: tokenData.access_token ? '***set***' : 'MISSING', refresh_token: tokenData.refresh_token ? '***set***' : 'MISSING' }))

  if (!tokenData.refresh_token || !tokenData.access_token) {
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=${encodeURIComponent(tokenData.error_description || tokenData.error || 'token_exchange_failed')}`, origin)
    )
  }

  // Get the authenticated Google user's email
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const userInfo = await userInfoRes.json()

  const supabase = await createClient()
  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()

  const { error: dbError } = await supabase
    .from('platform_tokens')
    .upsert({
      platform: 'google_ads',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expiry: expiresAt,
      scope: tokenData.scope,
      connected_email: userInfo.email ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform' })

  if (dbError) {
    console.error('[google-oauth] DB error:', dbError)
    return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', origin))
  }

  return NextResponse.redirect(new URL('/dashboard/platform?connected=google', origin))
}
