import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Get access token from platform_tokens with auto-refresh
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    
    const { data: tokenData, error } = await supabase
      .from('platform_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('platform', 'google_sheets')
      .single()
    
    if (error || !tokenData) return null
    
    const expiryTime = new Date(tokenData.token_expiry).getTime()
    const now = Date.now()
    const bufferMs = 5 * 60 * 1000
    
    if (expiryTime > now + bufferMs) {
      return tokenData.access_token
    }
    
    if (!tokenData.refresh_token) return null
    
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) return null
    
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    
    const refreshData = await refreshRes.json()
    if (!refreshRes.ok || !refreshData.access_token) return null
    
    const newExpiry = new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString()
    await supabase
      .from('platform_tokens')
      .update({
        access_token: refreshData.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('platform', 'google_sheets')
    
    return refreshData.access_token
  } catch {
    return null
  }
}

// GET /api/google-sheets/[spreadsheetId]/sheets - List sheets in a spreadsheet
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spreadsheetId: string }> }
) {
  const { spreadsheetId } = await params
  
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'No Google Sheets token' }, { status: 401 })
  }

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!res.ok) {
      const errorData = await res.json()
      return NextResponse.json({ error: errorData.error?.message || 'Error fetching sheets' }, { status: res.status })
    }

    const data = await res.json()

    return NextResponse.json({
      spreadsheetId,
      title: data.properties?.title,
      sheets: data.sheets?.map((s: { properties: { sheetId: number; title: string; index: number } }) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        index: s.properties.index,
      })) ?? [],
    })
  } catch (err) {
    console.error('[google-sheets] Error fetching sheets:', err)
    return NextResponse.json({ error: 'Error fetching sheets' }, { status: 500 })
  }
}
