import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback` : 'http://localhost:3000/api/google/callback'
)

// GET: Get auth URL or list events
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'auth-url') {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ]

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'select_account consent',
    })

    return NextResponse.json({ url: authUrl })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// POST: Create calendar event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accessToken, event } = body

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token provided' }, { status: 401 })
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
    return NextResponse.json(
      { error: 'Failed to create event', details: String(error) },
      { status: 500 }
    )
  }
}
