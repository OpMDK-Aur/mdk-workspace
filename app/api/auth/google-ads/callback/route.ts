import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.madketing.io'
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/auth/google-ads/callback`
  const sp = request.nextUrl.searchParams
  const code = sp.get('code')
  const error = sp.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=${encodeURIComponent(error || 'no_code')}`, appUrl)
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/dashboard/platform?error=missing_credentials', appUrl)
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
  
  if (tokenData.error) {
    console.error('[google-ads] Token error:', tokenData.error, tokenData.error_description)
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`, appUrl)
    )
  }

  if (!tokenData.access_token) {
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=no_access_token`, appUrl)
    )
  }

  // Get the authenticated Google user's email
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const userInfo = await userInfoRes.json()

  const supabase = await createClient()
  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()

  // Check if we already have a refresh_token stored (Google only sends it on first auth)
  let refreshToken = tokenData.refresh_token
  if (!refreshToken) {
    const { data: existing } = await supabase
      .from('plataformas_tokens')
      .select('refresh_token')
      .eq('plataforma', 'google_ads')
      .single()
    
    if (existing?.refresh_token) {
      refreshToken = existing.refresh_token
    } else {
      return NextResponse.redirect(
        new URL('/dashboard/platform?error=no_refresh_token_revoke_required', appUrl)
      )
    }
  }

  const { error: dbError } = await supabase
    .from('plataformas_tokens')
    .upsert({
      plataforma: 'google_ads',
      nombre_cuenta: 'Google Ads',
      account_id: userInfo.id || null,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      token_expiry: expiresAt,
      scope: tokenData.scope,
      email_conectado: userInfo.email ?? null,
      activo: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'plataforma' })

  if (dbError) {
    console.error('[google-ads] DB error:', dbError)
    return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', appUrl))
  }

  return NextResponse.redirect(new URL('/dashboard/platform?connected=google_ads', appUrl))
}
