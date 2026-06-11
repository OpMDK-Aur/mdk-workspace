import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/auth/google-sheets/callback`
  const sp = request.nextUrl.searchParams
  const code = sp.get('code')
  const error = sp.get('error')
  const userId = sp.get('state')

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
    console.error('[google-sheets-callback] Token error:', tokenData.error)
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=${encodeURIComponent(tokenData.error_description || tokenData.error || 'no_token')}`, origin)
    )
  }

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const userInfo = await userInfoRes.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', origin))
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString()
  const adminClient = createAdminClient()

  // Borrar token anterior si existe
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
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      token_expiry: expiresAt,
      email_conectado: userInfo.email || null,
      scope: tokenData.scope || null,
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

  if (dbError) {
    console.error('[google-sheets-callback] DB error:', dbError)
    return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', origin))
  }

  return NextResponse.redirect(new URL('/dashboard/platform?connected=google_sheets', origin))
}