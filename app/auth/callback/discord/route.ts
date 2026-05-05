import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // Try to get Discord info from identities first, then user_metadata
      const discordIdentity = data.user.identities?.find(i => i.provider === 'discord')
      const userMeta = data.user.user_metadata
      
      // Extract Discord info from either source
      const discordId = discordIdentity?.id || 
                       userMeta?.provider_id || 
                       userMeta?.sub || null
      const discordUsername = discordIdentity?.identity_data?.full_name || 
                             discordIdentity?.identity_data?.name || 
                             userMeta?.full_name || 
                             userMeta?.name ||
                             userMeta?.custom_claims?.global_name || null
      const discordAvatar = discordIdentity?.identity_data?.avatar_url || 
                           userMeta?.avatar_url || null

      if (discordId) {
        const { error: updateError } = await supabase
          .from('colaboradores')
          .update({
            discord_id: discordId,
            discord_username: discordUsername,
            discord_avatar: discordAvatar,
          })
          .eq('id', data.user.id)

        if (updateError) {
          console.error('[v0] Error updating Discord info:', updateError)
        }
      }
      
      return NextResponse.redirect(new URL('/dashboard/platform?discord=connected', origin))
    }
  }

  return NextResponse.redirect(new URL('/dashboard/platform?discord=error', origin))
}
