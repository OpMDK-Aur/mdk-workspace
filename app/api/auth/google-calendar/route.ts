import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.madketing.io'
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/api/auth/google-calendar/callback`,
      scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error || !data.url) {
    console.error('Error initiating Google Calendar OAuth:', error)
    return NextResponse.json({ error: 'Error al iniciar conexión con Google Calendar' }, { status: 500 })
  }

  return NextResponse.redirect(data.url)
}
