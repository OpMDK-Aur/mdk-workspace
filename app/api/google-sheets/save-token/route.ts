import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { access_token, refresh_token } = body

  if (!access_token) {
    return NextResponse.json({ error: 'No access token provided' }, { status: 400 })
  }

  // Verify the token has sheets scope by making a test request
  const testRes = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
    headers: { Authorization: `Bearer ${access_token}` },
  })

  if (!testRes.ok) {
    return NextResponse.json({ error: 'Token does not have required scopes' }, { status: 400 })
  }

  // Get user email from token
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userInfo = await userInfoRes.json()

  // Check for existing refresh token if not provided
  let finalRefreshToken = refresh_token
  if (!finalRefreshToken) {
    const { data: existing } = await supabase
      .from('platform_tokens')
      .select('refresh_token')
      .eq('platform', 'google_sheets')
      .single()
    
    finalRefreshToken = existing?.refresh_token
  }

  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()

  const { error: dbError } = await supabase
    .from('platform_tokens')
    .upsert({
      platform: 'google_sheets',
      access_token,
      refresh_token: finalRefreshToken,
      token_expiry: expiresAt,
      connected_email: userInfo.email ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform' })

  if (dbError) {
    console.error('[google-sheets] DB error:', dbError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
