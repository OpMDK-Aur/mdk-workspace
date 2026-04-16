import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  
  const { data: tokenData, error } = await supabase
    .from('platform_tokens')
    .select('access_token, refresh_token, token_expiry, connected_email, updated_at')
    .eq('platform', 'google_sheets')
    .single()
  
  if (error || !tokenData) {
    return NextResponse.json({
      connected: false,
      email: null,
    })
  }

  const isExpired = new Date(tokenData.token_expiry).getTime() < Date.now()
  const hasRefreshToken = !!tokenData.refresh_token

  return NextResponse.json({
    connected: !!tokenData.access_token && (hasRefreshToken || !isExpired),
    email: tokenData.connected_email,
    expiresAt: tokenData.token_expiry,
    updatedAt: tokenData.updated_at,
  })
}
