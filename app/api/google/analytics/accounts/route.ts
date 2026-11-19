import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGoogleAnalyticsAccess } from '@/lib/google-analytics/user-token'

export const dynamic = 'force-dynamic'

type AnalyticsProperty = { propertyId: string; propertyName: string; accountName: string; accountId: string }

const CACHE_TTL_MS = 5 * 60_000
const MAX_PAGES = 20
const cacheByUser = new Map<string, { expiresAt: number; email: string | null; accounts: AnalyticsProperty[] }>()

/** Propiedades GA4 a las que tiene acceso la cuenta de Google que conectó el usuario logueado. */
export async function GET(request: Request) {
  const access = await getGoogleAnalyticsAccess()
  if ('error' in access) {
    if (access.error === 'unauthenticated') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    return NextResponse.json({ connected: false, expired: access.error === 'expired', accounts: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  const cached = cacheByUser.get(access.userId)
  if (!refresh && cached && cached.expiresAt > Date.now() && cached.email === access.email) {
    return NextResponse.json({ connected: true, email: access.email, accounts: cached.accounts }, { headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ access_token: access.accessToken })
    const admin = google.analyticsadmin({ version: 'v1beta', auth })
    const accounts: AnalyticsProperty[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await admin.accountSummaries.list({ pageSize: 200, pageToken })
      for (const account of data.accountSummaries ?? []) {
        for (const property of account.propertySummaries ?? []) {
          accounts.push({
            accountId: account.account?.replace('accounts/', '') ?? '',
            accountName: account.displayName ?? 'Cuenta sin nombre',
            propertyId: property.property?.replace('properties/', '') ?? '',
            propertyName: property.displayName ?? 'Propiedad sin nombre',
          })
        }
      }
      pageToken = data.nextPageToken ?? undefined
      if (!pageToken) break
    }
    cacheByUser.set(access.userId, { accounts, email: access.email, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ connected: true, email: access.email, accounts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const needsReconnect = /invalid_grant|insufficient|scope|permission|401|403/i.test(message)
    return NextResponse.json(
      { connected: true, email: access.email, expired: needsReconnect, accounts: [], error: needsReconnect ? 'Tu conexión con Google Analytics no tiene permisos suficientes. Volvé a conectar tu cuenta.' : 'No se pudieron cargar tus propiedades de Google Analytics.' },
      { status: needsReconnect ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
