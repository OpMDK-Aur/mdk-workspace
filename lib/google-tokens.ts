// Centralized Google OAuth token management using environment variables
// All Google API requests should use these functions to get access tokens

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface TokenResult {
  accessToken: string | null
  error?: string
}

/**
 * Get Google Ads access token from environment variables.
 * Automatically refreshes the token if GOOGLE_ADS_REFRESH_TOKEN is set.
 */
export async function getGoogleAdsAccessToken(): Promise<TokenResult> {
  const accessToken = process.env.GOOGLE_ADS_ACCESS_TOKEN
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  // If we have a refresh token, always refresh to get a fresh access token
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

      console.error('[google-tokens] Failed to refresh Google Ads token:', data)
      // Fall through to try static access token
    } catch (error) {
      console.error('[google-tokens] Error refreshing Google Ads token:', error)
    }
  }

  // Fallback to static access token
  if (accessToken) {
    return { accessToken }
  }

  return { 
    accessToken: null, 
    error: 'No se encontraron credenciales de Google Ads. Configurá GOOGLE_ADS_REFRESH_TOKEN y GOOGLE_CLIENT_ID/SECRET.' 
  }
}

/**
 * Get Google Calendar access token from environment variables.
 * Automatically refreshes the token if GOOGLE_CALENDAR_REFRESH_TOKEN is set.
 */
export async function getGoogleCalendarAccessToken(): Promise<TokenResult> {
  const accessToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  // If we have a refresh token, always refresh to get a fresh access token
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

      console.error('[google-tokens] Failed to refresh Google Calendar token:', data)
    } catch (error) {
      console.error('[google-tokens] Error refreshing Google Calendar token:', error)
    }
  }

  // Fallback to static access token
  if (accessToken) {
    return { accessToken }
  }

  return { 
    accessToken: null, 
    error: 'No se encontraron credenciales de Google Calendar. Configurá GOOGLE_CALENDAR_REFRESH_TOKEN y GOOGLE_CLIENT_ID/SECRET.' 
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
