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
  console.log('[google-oauth] Token response status:', tokenRes.status)
  console.log('[google-oauth] Has access_token:', !!tokenData.access_token)
  console.log('[google-oauth] Has refresh_token:', !!tokenData.refresh_token)
  
  if (tokenData.error) {
    console.error('[google-oauth] Token error:', tokenData.error, tokenData.error_description)
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`, appUrl)
    )
  }

  if (!tokenData.access_token) {
    console.error('[google-oauth] No access_token received')
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=no_access_token`, appUrl)
    )
  }
  
  // Note: refresh_token might not be present on re-authorization if already granted
  // In that case, we should keep the existing refresh_token

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
      .from('platform_tokens')
      .select('refresh_token')
      .eq('platform', 'google_ads')
      .single()
    
    if (existing?.refresh_token) {
      refreshToken = existing.refresh_token
      console.log('[google-oauth] Using existing refresh_token from database')
    } else {
      console.error('[google-oauth] No refresh_token available - user needs to revoke and re-authorize')
      return NextResponse.redirect(
        new URL('/dashboard/platform?error=no_refresh_token_revoke_required', appUrl)
      )
    }
  }

  console.log('[google-oauth] Saving to platform_tokens:')
  console.log('[google-oauth] - access_token length:', tokenData.access_token?.length)
  console.log('[google-oauth] - refresh_token length:', refreshToken?.length)
  console.log('[google-oauth] - token_expiry:', expiresAt)
  console.log('[google-oauth] - connected_email:', userInfo.email)

  const { error: dbError } = await supabase
    .from('platform_tokens')
    .upsert({
      platform: 'google_ads',
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      token_expiry: expiresAt,
      scope: tokenData.scope,
      connected_email: userInfo.email ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform' })

  if (dbError) {
    console.error('[google-oauth] DB error:', dbError)
    return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', appUrl))
  }

  // Verify the token was saved correctly
  const { data: verifyData, error: verifyError } = await supabase
    .from('platform_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('platform', 'google_ads')
    .single()
  
  if (verifyError || !verifyData) {
    console.error('[google-oauth] Verification failed:', verifyError)
  } else {
    console.log('[google-oauth] Verified saved token:')
    console.log('[google-oauth] - access_token saved:', !!verifyData.access_token)
    console.log('[google-oauth] - refresh_token saved:', !!verifyData.refresh_token)
    console.log('[google-oauth] - token_expiry saved:', verifyData.token_expiry)
  }

  return NextResponse.redirect(new URL('/dashboard/platform?connected=google', appUrl))
}
