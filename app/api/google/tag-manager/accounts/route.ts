import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET() {
  try {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
    const tagmanager = google.tagmanager({ version: 'v2', auth })
    const accounts = await tagmanager.accounts.list({})
    const result = []
    for (const account of accounts.data.account ?? []) {
      const containers = await tagmanager.accounts.containers.list({ parent: account.path ?? '' })
      for (const container of containers.data.container ?? []) result.push({ accountId: account.accountId ?? '', accountName: account.name ?? '', containerId: container.containerId ?? '', containerName: container.name ?? '', publicId: container.publicId ?? '' })
    }
    return NextResponse.json({ accounts: result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar contenedores de Tag Manager' }, { status: 500 })
  }
}
