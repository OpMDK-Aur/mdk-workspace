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

function normalizeGoogleAccessToken(value: string | undefined | null) {
  const token = value?.trim().replace(/^Bearer\s+/i, '')
  return token || null
}

/**
 * Token guardado en plataformas_tokens. Con `userId` lee solo la conexión de ese
 * usuario (cada persona conecta su propia cuenta de Google desde Conectores).
 */
async function getTokenFromDb(plataforma: string, userId?: string): Promise<TokenData | null> {
  try {
    const supabase = createClient()
    let query = supabase
      .from('plataformas_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('plataforma', plataforma)
    if (userId) query = query.eq('cliente_id', userId).eq('activo', true).order('updated_at', { ascending: false }).limit(1)
    const { data, error } = await query.maybeSingle()

    if (error || !data) return null
    return data as TokenData
  } catch {
    return null
  }
}

/**
 * Renueva el access token y lo guarda. Con `userId` solo actualiza la fila de
 * ese usuario; sin él, solo la fila global (sin usuario) para no pisar con el
 * token de la agencia las conexiones personales.
 */
async function refreshAndUpdateToken(
  plataforma: string,
  refreshToken: string,
  userId?: string
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
      console.error(`[google-tokens] Failed to refresh ${plataforma} token:`, data?.error ?? res.status)
      return null
    }

    const supabase = createClient()
    const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()

    const update = supabase
      .from('plataformas_tokens')
      .update({
        access_token: data.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('plataforma', plataforma)
    await (userId ? update.eq('cliente_id', userId) : update.is('cliente_id', null))

    return data.access_token
  } catch (error) {
    console.error(`[google-tokens] Error refreshing ${plataforma} token:`, error)
    return null
  }
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Token vigente de la conexión personal del usuario, renovándolo si está por vencer. */
async function getUserToken(plataforma: string, userId: string): Promise<string | null> {
  const dbToken = await getTokenFromDb(plataforma, userId)
  if (!dbToken) return null
  const expiry = dbToken.token_expiry ? new Date(dbToken.token_expiry).getTime() : 0
  if (dbToken.access_token && expiry > Date.now() + REFRESH_BUFFER_MS) return dbToken.access_token
  if (!dbToken.refresh_token) return null
  return refreshAndUpdateToken(plataforma, dbToken.refresh_token, userId)
}

/**
 * Get Google Ads access token.
 * 1. First tries to read from plataformas_tokens table
 * 2. Falls back to environment variables if not found
 */
export async function refreshGoogleAdsAccessToken(): Promise<string | null> {
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  if (!refreshToken) return null
  return refreshAndUpdateToken('google_ads', refreshToken)
}

export async function getGoogleAdsAccessToken(options: { userId?: string } = {}): Promise<TokenResult & { source?: 'user' | 'agency' }> {
  // Con `userId` se usa primero la cuenta de Google Ads que conectó esa persona.
  if (options.userId) {
    const userToken = await getUserToken('google_ads', options.userId)
    if (userToken) return { accessToken: userToken, source: 'user' }
  }

  // Preferimos renovar con OAuth porque GOOGLE_ADS_ACCESS_TOKEN expira aproximadamente en una hora.
  // El access token estático queda como fallback para instalaciones sin refresh token.
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim()
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()

  if (refreshToken && clientId && clientSecret) {
    const refreshedToken = await refreshAndUpdateToken('google_ads', refreshToken)
    if (refreshedToken) return { accessToken: refreshedToken, source: 'agency' }
  }

  const accessToken = normalizeGoogleAccessToken(process.env.GOOGLE_ADS_ACCESS_TOKEN)
  if (accessToken) return { accessToken, source: 'agency' }

  return {
    accessToken: null,
    error: 'No se pudo obtener un access token válido de Google Ads. Verifica GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.'
  }

  /*
  // Database/refresh-token flow kept disabled intentionally for Google Ads.
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
    error: 'No se encontraron credenciales de Google Ads. Conectá tu cuenta desde Conectores.'
  }
  */
}

/**
 * Get Google Calendar access token.
 * 1. First tries to read from plataformas_tokens table
 * 2. Falls back to environment variables if not found
 */
/**
 * Token del calendario que conectó esa persona, sin caer en el de la agencia.
 * Se usa para leer su agenda: nunca hay que mezclarla con la de otra cuenta.
 */
export async function getUserGoogleCalendarAccessToken(userId: string): Promise<string | null> {
  return getUserToken('google_calendar', userId)
}

/** Token de Google Docs/Drive que conectó esa persona en Conectores (solo lectura). */
export async function getUserGoogleDocsAccessToken(userId: string): Promise<string | null> {
  return getUserToken('google_docs', userId)
}

export async function getGoogleCalendarAccessToken(options: { userId?: string } = {}): Promise<TokenResult> {
  // Con `userId` se usa primero el calendario que conectó esa persona.
  if (options.userId) {
    const userToken = await getUserToken('google_calendar', options.userId)
    if (userToken) return { accessToken: userToken }
  }

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
    error: 'No se encontraron credenciales de Google Calendar. Conectá tu cuenta desde Conectores.' 
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
