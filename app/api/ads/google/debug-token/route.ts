import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    // Get token from platform_tokens
    const { data: tokenData, error } = await supabase
      .from('platform_tokens')
      .select('platform, access_token, refresh_token, token_expiry, connected_email, updated_at')
      .eq('platform', 'google_ads')
      .single()
    
    if (error) {
      return NextResponse.json({ 
        status: 'NO_TOKEN',
        error: error.message,
        message: 'No hay token de Google Ads guardado. Conecta desde Plataformas.'
      })
    }
    
    const now = Date.now()
    const expiryTime = new Date(tokenData.token_expiry).getTime()
    const isExpired = expiryTime <= now
    const expiresIn = Math.round((expiryTime - now) / 1000 / 60) // minutes
    
    return NextResponse.json({
      status: 'OK',
      hasAccessToken: !!tokenData.access_token,
      accessTokenLength: tokenData.access_token?.length ?? 0,
      hasRefreshToken: !!tokenData.refresh_token,
      refreshTokenLength: tokenData.refresh_token?.length ?? 0,
      tokenExpiry: tokenData.token_expiry,
      isExpired,
      expiresInMinutes: isExpired ? 0 : expiresIn,
      connectedEmail: tokenData.connected_email,
      updatedAt: tokenData.updated_at,
    })
  } catch (err) {
    return NextResponse.json({ 
      status: 'ERROR',
      error: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
