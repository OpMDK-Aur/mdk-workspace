import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/onboarding'
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // After successful OAuth, redirect to the intended destination
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  // Return to login on error
  return NextResponse.redirect(new URL('/auth/login?error=auth_callback_error', origin))
}
