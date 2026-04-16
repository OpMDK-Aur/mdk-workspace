import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Get access token from platform_tokens (reuse google_ads token which has same Google account)
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    
    // Use google_ads token - same Google account, just needs Drive/Sheets scopes added
    const { data: tokenData, error } = await supabase
      .from('platform_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('platform', 'google_ads')
      .single()
    
    if (error || !tokenData) return null
    
    // Check if token is expired or will expire in 5 minutes
    const expiryTime = new Date(tokenData.token_expiry).getTime()
    const now = Date.now()
    const bufferMs = 5 * 60 * 1000
    
    if (expiryTime > now + bufferMs) {
      return tokenData.access_token
    }
    
    // Token expired, refresh it
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
    
    // Update token in database
    const newExpiry = new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString()
    await supabase
      .from('platform_tokens')
      .update({
        access_token: refreshData.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('platform', 'google_ads')
    
    return refreshData.access_token
  } catch {
    return null
  }
}

// GET /api/google-sheets - List recent spreadsheets
export async function GET() {
  console.log('[v0] google-sheets: Starting request')
  
  const accessToken = await getAccessToken()
  console.log('[v0] google-sheets: Access token exists:', !!accessToken)
  
  if (!accessToken) {
    return NextResponse.json({ error: 'No Google Sheets token. Conecta tu cuenta primero.' }, { status: 401 })
  }

  try {
    // Search for spreadsheets in Drive
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,modifiedTime)`
    console.log('[v0] google-sheets: Fetching from Drive API')
    
    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    console.log('[v0] google-sheets: Drive API response status:', driveRes.status)

    if (!driveRes.ok) {
      const errorData = await driveRes.json()
      console.log('[v0] google-sheets: Drive API error:', errorData)
      return NextResponse.json({ error: errorData.error?.message || 'Error listing spreadsheets' }, { status: driveRes.status })
    }

    const driveData = await driveRes.json()
    console.log('[v0] google-sheets: Found files count:', driveData.files?.length ?? 0)

    return NextResponse.json({
      spreadsheets: driveData.files?.map((f: { id: string; name: string; modifiedTime: string }) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      })) ?? [],
    })
  } catch (err) {
    console.error('[v0] google-sheets: Error:', err)
    return NextResponse.json({ error: 'Error fetching spreadsheets' }, { status: 500 })
  }
}
