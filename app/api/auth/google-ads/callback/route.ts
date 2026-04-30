import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin

  if (error) {
    console.error('[google-ads-callback] OAuth error:', error)
    return NextResponse.redirect(new URL('/dashboard/reuniones?error=oauth_error', appUrl))
  }

  if (!code) {
    console.error('[google-ads-callback] No code provided')
    return NextResponse.redirect(new URL('/dashboard/reuniones?error=no_code', appUrl))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${appUrl}/api/auth/google-ads/callback`

  if (!clientId || !clientSecret) {
    console.error('[google-ads-callback] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET')
    return NextResponse.redirect(new URL('/dashboard/reuniones?error=config_error', appUrl))
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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

    const tokens = await tokenResponse.json()

    if (!tokenResponse.ok || tokens.error) {
      console.error('[google-ads-callback] Token exchange failed:', tokens)
      return NextResponse.redirect(new URL('/dashboard/reuniones?error=token_error', appUrl))
    }

    // Get user email
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoResponse.json()

    // Save to plataformas_tokens
    const supabase = await createClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('plataformas_tokens')
      .upsert({
        plataforma: 'google_ads',
        nombre_cuenta: 'Google Ads',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expiry: expiresAt,
        email_conectado: userInfo.email || null,
        scope: tokens.scope || null,
        activo: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'plataforma' })

    if (dbError) {
      console.error('[google-ads-callback] DB error:', dbError)
      return NextResponse.redirect(new URL('/dashboard/reuniones?error=db_error', appUrl))
    }

    return NextResponse.redirect(new URL('/dashboard/reuniones?connected=google_ads', appUrl))
  } catch (err) {
    console.error('[google-ads-callback] Error:', err)
    return NextResponse.redirect(new URL('/dashboard/reuniones?error=unknown', appUrl))
  }
}
