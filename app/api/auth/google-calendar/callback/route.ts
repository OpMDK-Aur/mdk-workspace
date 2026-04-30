import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  const supabase = await createClient()
  
  // Exchange code for session if present
  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    console.log('[v0] google-calendar-callback - exchangeCodeForSession result:', {
      hasSession: !!data?.session,
      providerToken: !!data?.session?.provider_token,
      providerRefreshToken: !!data?.session?.provider_refresh_token,
      error: exchangeError?.message
    })
    
    if (data?.session?.provider_token) {
      const session = data.session
      const providerToken = session.provider_token
      const providerRefreshToken = session.provider_refresh_token
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()

      // Store the calendar tokens in plataformas_tokens table
      const { error: dbError } = await supabase
        .from('plataformas_tokens')
        .upsert({
          plataforma: 'google_calendar',
          nombre_cuenta: 'Google Calendar',
          account_id: session.user.id,
          access_token: providerToken,
          refresh_token: providerRefreshToken || null,
          token_expiry: expiresAt,
          scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
          email_conectado: session.user.email,
          activo: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'plataforma' })

      console.log('[v0] google-calendar-callback - DB upsert result:', { error: dbError?.message })

      if (dbError) {
        return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', appUrl))
      }

      return NextResponse.redirect(new URL('/dashboard/platform?connected=google_calendar', appUrl))
    }
  }
  
  // Fallback - check current session
  const { data: { session }, error } = await supabase.auth.getSession()
  
  console.log('[v0] google-calendar-callback - fallback session:', {
    hasSession: !!session,
    providerToken: !!session?.provider_token,
    error: error?.message
  })
  
  if (error || !session) {
    return NextResponse.redirect(new URL('/dashboard/platform?error=no_session', appUrl))
  }

  // If no provider token, redirect with warning
  if (!session.provider_token) {
    return NextResponse.redirect(new URL('/dashboard/platform?error=no_provider_token', appUrl))
  }

  return NextResponse.redirect(new URL('/dashboard/platform?connected=google_calendar', appUrl))
}
