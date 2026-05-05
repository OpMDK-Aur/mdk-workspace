import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Check if user has completed onboarding
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('onboarding_completado')
        .eq('id', data.user.id)
        .single()
      
      // If next param is provided, use it; otherwise decide based on onboarding status
      let redirectTo = next
      if (!redirectTo) {
        redirectTo = colaborador?.onboarding_completado ? '/dashboard' : '/onboarding'
      }
      
      return NextResponse.redirect(new URL(redirectTo, origin))
    }
  }

  // Return to login on error
  return NextResponse.redirect(new URL('/auth/login?error=auth_callback_error', origin))
}
