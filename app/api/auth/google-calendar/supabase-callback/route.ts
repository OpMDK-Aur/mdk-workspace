import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.madketing.io'
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    
    // Exchange code for session
    const { data: { session }, error: authError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (authError) {
      console.error('[google-calendar-supabase] Auth error:', authError)
      return NextResponse.redirect(new URL(`/dashboard/platform?error=${encodeURIComponent(authError.message)}`, appUrl))
    }

    if (session?.provider_token) {
      // Save the token to platform_tokens
      const { error: dbError } = await supabase
        .from('platform_tokens')
        .upsert({
          platform: 'google_calendar',
          access_token: session.provider_token,
          refresh_token: session.provider_refresh_token || null,
          token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
          connected_email: session.user?.email || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'platform',
        })

      if (dbError) {
        console.error('[google-calendar-supabase] DB error:', dbError)
        return NextResponse.redirect(new URL('/dashboard/platform?error=db_error', appUrl))
      }

      return NextResponse.redirect(new URL('/dashboard/platform?connected=google_calendar', appUrl))
    } else {
      console.error('[google-calendar-supabase] No provider_token in session')
      return NextResponse.redirect(new URL('/dashboard/platform?error=no_provider_token', appUrl))
    }
  }

  return NextResponse.redirect(new URL('/dashboard/platform?error=no_code', appUrl))
}
