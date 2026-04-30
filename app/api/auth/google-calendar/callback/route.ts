import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  const supabase = await createClient()

  // Exchange code for session using Supabase
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('[v0] google-calendar-callback - Error exchanging code:', error)
      return NextResponse.redirect(new URL('/dashboard/platform?error=auth_error', appUrl))
    }

    const providerToken = data.session?.provider_token
    const providerRefreshToken = data.session?.provider_refresh_token
    const userEmail = data.session?.user?.email

    console.log('[v0] google-calendar-callback - provider_token:', providerToken ? 'exists' : 'null')
    console.log('[v0] google-calendar-callback - provider_refresh_token:', providerRefreshToken ? 'exists' : 'null')

    if (!providerToken) {
      return NextResponse.redirect(new URL('/dashboard/platform?error=no_provider_token', appUrl))
    }

    // Check if we need to preserve existing refresh_token
    let refreshToken = providerRefreshToken
    if (!refreshToken) {
      const { data: existing } = await supabase
        .from('plataformas_tokens')
        .select('refresh_token')
        .eq('plataforma', 'google_calendar')
        .single()
      
      if (existing?.refresh_token) {
        refreshToken = existing.refresh_token
      }
    }

    // Store in plataformas_tokens
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('plataformas_tokens')
      .upsert({
        plataforma: 'google_calendar',
        nombre_cuenta: 'Google Calendar',
        access_token: providerToken,
        refresh_token: refreshToken || null,
        token_expiry: expiresAt,
        email_conectado: userEmail,
        scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
        activo: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'plataforma' })

    if (dbError) {
      console.error('[v0] google-calendar-callback - DB error:', dbError)
      return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', appUrl))
    }

    return NextResponse.redirect(new URL('/dashboard/platform?connected=google_calendar', appUrl))
  }

  return NextResponse.redirect(new URL('/dashboard/platform?error=no_code', appUrl))
}
