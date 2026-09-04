import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export const revalidate = 300

type TagManagerAccount = { accountId: string; accountName: string; containerId: string; containerName: string; publicId: string }
let cachedAccounts: { expiresAt: number; accounts: TagManagerAccount[] } | null = null
let pendingRequest: Promise<TagManagerAccount[]> | null = null

export async function GET() {
  try {
    if (cachedAccounts && cachedAccounts.expiresAt > Date.now()) {
      return Response.json({ accounts: cachedAccounts.accounts }, { headers: { 'Cache-Control': 'private, max-age=300' } })
    }
    if (pendingRequest) {
      const accounts = await pendingRequest
      return Response.json({ accounts }, { headers: { 'Cache-Control': 'private, max-age=300' } })
    }
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
    const tagmanager = google.tagmanager({ version: 'v2', auth })
    pendingRequest = (async () => {
      const accounts = await tagmanager.accounts.list({})
      const result: Array<{ accountId: string; accountName: string; containerId: string; containerName: string; publicId: string }> = []
      for (const account of accounts.data.account ?? []) {
        const containers = await tagmanager.accounts.containers.list({ parent: account.path ?? '' })
        for (const container of containers.data.container ?? []) result.push({ accountId: account.accountId ?? '', accountName: account.name ?? '', containerId: container.containerId ?? '', containerName: container.name ?? '', publicId: container.publicId ?? '' })
      }
      return result
    })()
    const result = await pendingRequest
    cachedAccounts = { accounts: result, expiresAt: Date.now() + 300_000 }
    pendingRequest = null
    return NextResponse.json({ accounts: result }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar contenedores de Tag Manager' }, { status: 500 })
  }
}
