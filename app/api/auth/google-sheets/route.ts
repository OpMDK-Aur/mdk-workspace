import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const origin = request.nextUrl.origin

  // Use Supabase OAuth with Google Sheets scope (uses Supabase's configured redirect URIs)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly',
      redirectTo: `${origin}/dashboard/crm?tab=sheets`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error || !data.url) {
    return NextResponse.json({ error: error?.message ?? 'Failed to initiate OAuth' }, { status: 500 })
  }

  return NextResponse.redirect(data.url)
}
