import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)

// Helper to get and refresh token from database
async function getValidToken() {
  const supabase = await createClient()
  
  const { data: tokenData, error } = await supabase
    .from('platform_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('platform', 'google_ads')
    .maybeSingle()

  if (error || !tokenData) {
    return null
  }

  // Check if token is expired
  const now = new Date()
  const expiry = tokenData.token_expiry ? new Date(tokenData.token_expiry) : null
  
  if (expiry && expiry > now) {
    // Token still valid
    return tokenData.access_token
  }

  // Token expired, need to refresh
  if (!tokenData.refresh_token) {
    return null
  }

  try {
    oauth2Client.setCredentials({ refresh_token: tokenData.refresh_token })
    const { credentials } = await oauth2Client.refreshAccessToken()
    
    // Update token in database
    const newExpiry = credentials.expiry_date 
      ? new Date(credentials.expiry_date).toISOString()
      : new Date(Date.now() + 3600000).toISOString() // 1 hour default

    await supabase
      .from('platform_tokens')
      .update({
        access_token: credentials.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('platform', 'google_ads')

    return credentials.access_token
  } catch (refreshError) {
    console.error('Error refreshing token:', refreshError)
    return null
  }
}

// POST: Create calendar event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event } = body

    // Get valid token from database
    const accessToken = await getValidToken()
    
    if (!accessToken) {
      return NextResponse.json({ 
        error: 'No valid Google token. Please reconnect in Platform settings.',
        needsReauth: true 
      }, { status: 401 })
    }

    oauth2Client.setCredentials({ access_token: accessToken })
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const calendarEvent = {
      summary: event.title,
      description: event.description || '',
      start: {
        dateTime: event.startDateTime,
        timeZone: event.timeZone || 'America/Argentina/Buenos_Aires',
      },
      end: {
        dateTime: event.endDateTime,
        timeZone: event.timeZone || 'America/Argentina/Buenos_Aires',
      },
      attendees: event.attendees?.map((email: string) => ({ email })) || [],
      conferenceData: event.addMeet ? {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      } : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: calendarEvent,
      conferenceDataVersion: event.addMeet ? 1 : 0,
      sendUpdates: 'all',
    })

    return NextResponse.json({
      success: true,
      event: {
        id: response.data.id,
        htmlLink: response.data.htmlLink,
        hangoutLink: response.data.hangoutLink,
      },
    })
  } catch (error) {
    console.error('Error creating calendar event:', error)
    
    // Check if it's a scope error
    const errorStr = String(error)
    if (errorStr.includes('insufficient') || errorStr.includes('scope') || errorStr.includes('calendar')) {
      return NextResponse.json({
        error: 'Calendar scope not authorized. Please reconnect Google in Platform settings.',
        needsReauth: true,
        details: errorStr,
      }, { status: 403 })
    }
    
    return NextResponse.json(
      { error: 'Failed to create event', details: errorStr },
      { status: 500 }
    )
  }
}
