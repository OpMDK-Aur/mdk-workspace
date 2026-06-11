import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = await createClient()
    
    const { data: tokenData, error } = await supabase
      .from('plataformas_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('plataforma', 'google_sheets')
      .eq('activo', true)
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
      .from('plataformas_tokens')
      .update({
        access_token: refreshData.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('plataforma', 'google_sheets')
    
    return refreshData.access_token
  } catch {
    return null
  }
}

export async function GET() {
  const accessToken = await getAccessToken()
  
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Token de Google Sheets no disponible' },
      { status: 401 }
    )
  }

  // Aquí va la lógica específica de lectura/escritura de Sheets
  return NextResponse.json({ success: true })
}
