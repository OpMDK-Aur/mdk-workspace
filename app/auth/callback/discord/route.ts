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
      // Get Discord identity from user identities
      const discordIdentity = data.user.identities?.find(i => i.provider === 'discord')
      
      if (discordIdentity) {
        // Save Discord info to colaboradores table
        const discordId = discordIdentity.id
        const discordUsername = discordIdentity.identity_data?.full_name || 
                               discordIdentity.identity_data?.name || 
                               discordIdentity.identity_data?.username || null
        const discordAvatar = discordIdentity.identity_data?.avatar_url || null

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
