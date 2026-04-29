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
    .from('plataformas_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('plataforma', 'google_calendar')
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
      .from('plataformas_tokens')
      .update({
        access_token: credentials.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('plataforma', 'google_calendar')

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

    // Build event following Google Calendar API documentation
    // https://developers.google.com/calendar/api/guides/create-events
    const timeZone = event.timeZone || 'America/Argentina/Buenos_Aires'
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calendarEvent: any = {
      summary: event.title,
      description: event.description || '',
      start: {
        dateTime: event.startDateTime,
        timeZone: timeZone,
      },
      end: {
        dateTime: event.endDateTime,
        timeZone: timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    }

    // Add attendees if provided
    if (event.attendees && event.attendees.length > 0) {
      calendarEvent.attendees = event.attendees.map((email: string) => ({ email }))
    }

    // Add Google Meet conference if requested
    if (event.addMeet) {
      calendarEvent.conferenceData = {
        createRequest: {
          requestId: `mdk-meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      }
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: calendarEvent,
      conferenceDataVersion: event.addMeet ? 1 : 0,
      sendUpdates: event.attendees?.length > 0 ? 'all' : 'none',
    })

    return NextResponse.json({
      success: true,
      event: {
        id: response.data.id,
        htmlLink: response.data.htmlLink,
        hangoutLink: response.data.hangoutLink,
      },
    })
  } catch (error: unknown) {
    const errorObj = error as { response?: { data?: unknown }, message?: string }
    const errorStr = errorObj.message || String(error)
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
