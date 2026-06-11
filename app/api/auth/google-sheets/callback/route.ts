import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin

  if (error) {
    console.error('[google-sheets-callback] OAuth error:', error)
    return NextResponse.redirect(new URL('/dashboard/platform?error=oauth_error', appUrl))
  }

  if (!code) {
    console.error('[google-sheets-callback] No code provided')
    return NextResponse.redirect(new URL('/dashboard/platform?error=no_code', appUrl))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${appUrl}/api/auth/google-sheets/callback`

  if (!clientId || !clientSecret) {
    console.error('[google-sheets-callback] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET')
    return NextResponse.redirect(new URL('/dashboard/platform?error=config_error', appUrl))
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
      console.error('[google-sheets-callback] Token exchange failed:', tokens)
      return NextResponse.redirect(new URL('/dashboard/platform?error=token_error', appUrl))
    }

    // Get user email
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoResponse.json()

    // Save to plataformas_tokens
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      console.error('[google-sheets-callback] No authenticated user')
      return NextResponse.redirect(new URL('/dashboard/platform?error=not_authenticated', appUrl))
    }
    
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Use admin client to bypass RLS
    const adminClient = createAdminClient()

    // First try to delete existing record, then insert new one
    await adminClient
      .from('plataformas_tokens')
      .delete()
      .eq('plataforma', 'google_sheets')
      .eq('cliente_id', user.id)

    const { error: dbError } = await adminClient
      .from('plataformas_tokens')
      .insert({
        cliente_id: user.id,
        plataforma: 'google_sheets',
        nombre_cuenta: 'Google Sheets',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expiry: expiresAt,
        email_conectado: userInfo.email || null,
        scope: tokens.scope || null,
        activo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (dbError) {
      console.error('[google-sheets-callback] DB error:', dbError.message, dbError.details, dbError.hint)
      return NextResponse.redirect(new URL(`/dashboard/platform?error=db_error&msg=${encodeURIComponent(dbError.message)}`, appUrl))
    }

    return NextResponse.redirect(new URL('/dashboard/platform?connected=google_sheets', appUrl))
  } catch (err) {
    console.error('[google-sheets-callback] Error:', err)
    return NextResponse.redirect(new URL('/dashboard/platform?error=unknown', appUrl))
  }
}

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL('/dashboard/crm?error=missing_credentials', origin)
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
  
  if (tokenData.error || !tokenData.access_token) {
    console.error('[google-sheets-oauth] Token error:', tokenData.error)
    return NextResponse.redirect(
      new URL(`/dashboard/crm?error=${encodeURIComponent(tokenData.error_description || tokenData.error || 'no_token')}`, origin)
    )
  }

  // Get user email
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const userInfo = await userInfoRes.json()

  const supabase = await createClient()
  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()

  // Check existing refresh_token
  let refreshToken = tokenData.refresh_token
  if (!refreshToken) {
    const { data: existing } = await supabase
      .from('platform_tokens')
      .select('refresh_token')
      .eq('platform', 'google_sheets')
      .single()
    
    if (existing?.refresh_token) {
      refreshToken = existing.refresh_token
    } else {
      return NextResponse.redirect(
        new URL('/dashboard/crm?error=no_refresh_token', origin)
      )
    }
  }

  const { error: dbError } = await supabase
    .from('platform_tokens')
    .upsert({
      platform: 'google_sheets',
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      token_expiry: expiresAt,
      scope: tokenData.scope,
      connected_email: userInfo.email ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform' })

  if (dbError) {
    console.error('[google-sheets-oauth] DB error:', dbError)
    return NextResponse.redirect(new URL('/dashboard/crm?error=db_error', origin))
  }

  return NextResponse.redirect(new URL('/dashboard/crm?connected=sheets', origin))
}
