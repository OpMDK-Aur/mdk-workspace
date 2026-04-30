import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin
  const supabase = await createClient()
  
  // Exchange code for session if present
  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }
  
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error) {
    console.error('[google-calendar-callback] Session error:', error)
    return NextResponse.redirect(
      new URL(`/dashboard/platform?error=${encodeURIComponent(error.message)}`, appUrl)
    )
  }

  if (!session) {
    console.error('[google-calendar-callback] No session found')
    return NextResponse.redirect(
      new URL('/dashboard/platform?error=no_session', appUrl)
    )
  }

  // Get the provider token (Google Calendar access token)
  const providerToken = session.provider_token
  const providerRefreshToken = session.provider_refresh_token

  console.log('[google-calendar-callback] Provider token exists:', !!providerToken)
  console.log('[google-calendar-callback] Provider refresh token exists:', !!providerRefreshToken)

  if (providerToken) {
    // Store the calendar tokens in platform_tokens table
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('platform_tokens')
      .upsert({
        platform: 'google_calendar',
        access_token: providerToken,
        refresh_token: providerRefreshToken || null,
        token_expiry: expiresAt,
        connected_email: session.user.email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'platform' })

    if (dbError) {
      console.error('[google-calendar-callback] DB error:', dbError)
      return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', appUrl))
    }
  }

  return NextResponse.redirect(new URL('/dashboard/platform?connected=google_calendar', appUrl))
}
