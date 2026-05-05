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
      const user = data.user
      const userMeta = user.user_metadata
      const isDiscordAuth = user.app_metadata?.provider === 'discord' || userMeta?.iss?.includes('discord')
      
      // If this is a Discord auth, save Discord info to colaboradores
      if (isDiscordAuth || userMeta?.provider_id) {
        const discordId = userMeta?.provider_id || userMeta?.sub || null
        const discordUsername = userMeta?.full_name || userMeta?.name || userMeta?.custom_claims?.global_name || null
        const discordAvatar = userMeta?.avatar_url || null
        
        if (discordId) {
          await supabase
            .from('colaboradores')
            .update({
              discord_id: discordId,
              discord_username: discordUsername,
              discord_avatar: discordAvatar,
            })
            .eq('id', user.id)
        }
      }
      
      // Check if user has completed onboarding
      const { data: colaborador } = await supabase
        .from('colaboradores')
        .select('onboarding_completado')
        .eq('id', user.id)
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
