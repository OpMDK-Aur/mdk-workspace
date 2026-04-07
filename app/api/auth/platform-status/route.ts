import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: token } = await supabase
    .from('platform_tokens')
    .select('platform, connected_email, token_expiry, updated_at')
    .eq('platform', 'google_ads')
    .single()

  return NextResponse.json({
    google_ads: token
      ? {
          connected: true,
          email: token.connected_email,
          expiry: token.token_expiry,
          updated_at: token.updated_at,
        }
      : { connected: false },
  })
}
