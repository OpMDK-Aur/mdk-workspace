import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export const revalidate = 300
let cachedAccounts: { expiresAt: number; accounts: Array<{ propertyId: string; propertyName: string; accountName: string; accountId: string }> } | null = null

export async function GET() {
  if (cachedAccounts && cachedAccounts.expiresAt > Date.now()) {
    return Response.json({ accounts: cachedAccounts.accounts }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  }
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
    const admin = google.analyticsadmin({ version: 'v1beta', auth })
    const accounts = await admin.accountSummaries.list({ pageSize: 200 })
    const result = (accounts.data.accountSummaries ?? []).flatMap(account =>
      (account.propertySummaries ?? []).map(property => ({
        accountId: account.name?.replace('accountSummaries/', '') ?? '',
        accountName: account.displayName ?? 'Cuenta sin nombre',
        propertyId: property.property?.replace('properties/', '') ?? '',
        propertyName: property.displayName ?? 'Propiedad sin nombre',
      })),
    )
    cachedAccounts = { accounts: result, expiresAt: Date.now() + 300_000 }
    return NextResponse.json({ accounts: result }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar propiedades de Analytics' }, { status: 500 })
  }
}
