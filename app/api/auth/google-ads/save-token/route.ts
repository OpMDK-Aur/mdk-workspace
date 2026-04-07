import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { access_token, refresh_token } = await request.json()

  if (!access_token) {
    return NextResponse.json({ error: 'access_token requerido' }, { status: 400 })
  }

  // Get Google user email
  let email: string | null = null
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const info = await res.json()
    email = info.email ?? null
  } catch {
    // non-blocking
  }

  const { error } = await supabase
    .from('platform_tokens')
    .upsert({
      platform: 'google_ads',
      access_token,
      refresh_token: refresh_token ?? null,
      token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
      scope: 'https://www.googleapis.com/auth/adwords',
      connected_email: email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform' })

  if (error) {
    console.error('[save-token] DB error:', error)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email })
}
