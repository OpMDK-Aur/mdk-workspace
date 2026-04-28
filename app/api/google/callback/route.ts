import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback` : 'http://localhost:3000/api/google/callback'
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    // Redirect back to app with error
    return NextResponse.redirect(
      new URL(`/dashboard/tasks?google_error=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/dashboard/tasks?google_error=no_code', request.url)
    )
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)
    
    // Redirect back to app with tokens (in production, store these securely)
    const redirectUrl = new URL('/dashboard/tasks', request.url)
    redirectUrl.searchParams.set('google_auth', 'success')
    redirectUrl.searchParams.set('access_token', tokens.access_token || '')
    if (tokens.refresh_token) {
      redirectUrl.searchParams.set('refresh_token', tokens.refresh_token)
    }
    
    return NextResponse.redirect(redirectUrl)
  } catch (err) {
    console.error('Error exchanging code for tokens:', err)
    return NextResponse.redirect(
      new URL(`/dashboard/tasks?google_error=token_exchange_failed`, request.url)
    )
  }
}
