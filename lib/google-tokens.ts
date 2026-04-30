// Centralized Google OAuth token management
// Reads from plataformas_tokens table first, falls back to environment variables

import { createClient } from '@/lib/supabase/admin'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface TokenResult {
  accessToken: string | null
  error?: string
}

interface TokenData {
  access_token: string | null
  refresh_token: string | null
  token_expiry: string | null
}

/**
 * Get token data from plataformas_tokens table
 */
async function getTokenFromDb(plataforma: string): Promise<TokenData | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('plataformas_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('plataforma', plataforma)
      .maybeSingle()

    if (error || !data) return null
    return data as TokenData
  } catch {
    return null
  }
}

/**
 * Refresh token and update in database
 */
async function refreshAndUpdateToken(
  plataforma: string,
  refreshToken: string
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.access_token) {
      console.error(`[google-tokens] Failed to refresh ${plataforma} token:`, data)
      return null
    }

    // Update token in database
    const supabase = createClient()
    const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()

    await supabase
      .from('plataformas_tokens')
      .update({
        access_token: data.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('plataforma', plataforma)

    return data.access_token
  } catch (error) {
    console.error(`[google-tokens] Error refreshing ${plataforma} token:`, error)
    return null
  }
}

/**
 * Get Google Ads access token.
 * 1. First tries to read from plataformas_tokens table
 * 2. Falls back to environment variables if not found
 */
export async function getGoogleAdsAccessToken(): Promise<TokenResult> {
  // Try database first
  const dbToken = await getTokenFromDb('google_ads')
  
  if (dbToken?.refresh_token) {
    // Check if token is expired or will expire in 5 minutes
    const now = Date.now()
    const expiry = dbToken.token_expiry ? new Date(dbToken.token_expiry).getTime() : 0
    const bufferMs = 5 * 60 * 1000

    if (expiry > now + bufferMs && dbToken.access_token) {
      // Token still valid
      return { accessToken: dbToken.access_token }
    }

    // Token expired or expiring, refresh it
    const newToken = await refreshAndUpdateToken('google_ads', dbToken.refresh_token)
    if (newToken) {
      return { accessToken: newToken }
    }
  }

  // Fallback to environment variables
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (refreshToken && clientId && clientSecret) {
    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })

      const data = await res.json()

      if (res.ok && data.access_token) {
        return { accessToken: data.access_token }
      }
    } catch (error) {
      console.error('[google-tokens] Error refreshing Google Ads token from env:', error)
    }
  }

  const accessToken = process.env.GOOGLE_ADS_ACCESS_TOKEN
  if (accessToken) {
    return { accessToken }
  }

  return { 
    accessToken: null, 
    error: 'No se encontraron credenciales de Google Ads. Conecta tu cuenta desde Plataformas.' 
  }
}

/**
 * Get Google Calendar access token.
 * 1. First tries to read from plataformas_tokens table
 * 2. Falls back to environment variables if not found
 */
export async function getGoogleCalendarAccessToken(): Promise<TokenResult> {
  // Try database first
  const dbToken = await getTokenFromDb('google_calendar')
  
  if (dbToken?.refresh_token) {
    // Check if token is expired or will expire in 5 minutes
    const now = Date.now()
    const expiry = dbToken.token_expiry ? new Date(dbToken.token_expiry).getTime() : 0
    const bufferMs = 5 * 60 * 1000

    if (expiry > now + bufferMs && dbToken.access_token) {
      // Token still valid
      return { accessToken: dbToken.access_token }
    }

    // Token expired or expiring, refresh it
    const newToken = await refreshAndUpdateToken('google_calendar', dbToken.refresh_token)
    if (newToken) {
      return { accessToken: newToken }
    }
  }

  // Fallback to environment variables
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (refreshToken && clientId && clientSecret) {
    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })

      const data = await res.json()

      if (res.ok && data.access_token) {
        return { accessToken: data.access_token }
      }
    } catch (error) {
      console.error('[google-tokens] Error refreshing Google Calendar token from env:', error)
    }
  }

  const accessToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  if (accessToken) {
    return { accessToken }
  }

  return { 
    accessToken: null, 
    error: 'No se encontraron credenciales de Google Calendar. Conecta tu cuenta desde Plataformas.' 
  }
}

/**
 * Get Google Ads developer token from environment variables.
 */
export function getGoogleAdsDeveloperToken(): string | null {
  return process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null
}

/**
 * Get Google Ads login customer ID (MCC ID) from environment variables.
 */
export function getGoogleAdsLoginCustomerId(): string {
  return (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '4435948073').replace(/-/g, '')
}
