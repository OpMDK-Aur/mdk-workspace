import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export const revalidate = 300

type TagManagerAccount = { accountId: string; accountName: string; containerId: string; containerName: string; publicId: string }

function paginateAccounts(accounts: TagManagerAccount[], page: number) {
  const start = (page - 1) * PAGE_SIZE
  return { accounts: accounts.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: accounts.length, hasMore: start + PAGE_SIZE < accounts.length }
}

let cachedAccounts: { expiresAt: number; accounts: TagManagerAccount[] } | null = null
let pendingRequest: Promise<TagManagerAccount[]> | null = null
let blockedUntil = 0
let lastSyncStartedAt = 0

const PAGE_SIZE = 50
const CACHE_TTL = 10 * 60_000
const MIN_SYNC_INTERVAL = 60_000
const MAX_GOOGLE_REQUESTS_PER_SYNC = 20

export async function GET(request: Request) {
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)

  try {
    const now = Date.now()
    if (now < blockedUntil) {
      return NextResponse.json({ error: 'Google Tag Manager está temporalmente limitado por cuota. Intentá nuevamente en unos segundos.', retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000) }, { status: 429, headers: { 'Retry-After': String(Math.ceil((blockedUntil - now) / 1000)) } })
    }
    if (cachedAccounts && cachedAccounts.expiresAt > now) {
      return Response.json(paginateAccounts(cachedAccounts.accounts, page), { headers: { 'Cache-Control': 'private, max-age=300' } })
    }
    if (pendingRequest) {
      const accounts = await pendingRequest
      return Response.json(paginateAccounts(accounts, page), { headers: { 'Cache-Control': 'private, max-age=600' } })
    }
    if (now - lastSyncStartedAt < MIN_SYNC_INTERVAL) {
      return NextResponse.json({ error: 'La sincronización de Google Tag Manager está en pausa para respetar la cuota. Intentá nuevamente más tarde.', retryAfterSeconds: Math.ceil((MIN_SYNC_INTERVAL - (now - lastSyncStartedAt)) / 1000) }, { status: 429 })
    }
    lastSyncStartedAt = now
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN })
    const tagmanager = google.tagmanager({ version: 'v2', auth })
    pendingRequest = (async () => {
      const result: Array<{ accountId: string; accountName: string; containerId: string; containerName: string; publicId: string }> = []
      let accountPageToken: string | undefined
      let googleRequestCount = 0
      do {
        googleRequestCount += 1
        if (googleRequestCount > MAX_GOOGLE_REQUESTS_PER_SYNC) break
        const accounts = await tagmanager.accounts.list({ pageToken: accountPageToken })
        for (const account of accounts.data.account ?? []) {
          let containerPageToken: string | undefined
          do {
            googleRequestCount += 1
            if (googleRequestCount > MAX_GOOGLE_REQUESTS_PER_SYNC) break
            const containers = await tagmanager.accounts.containers.list({ parent: account.path ?? '', pageToken: containerPageToken })
            for (const container of containers.data.container ?? []) {
              result.push({ accountId: account.accountId ?? '', accountName: account.name ?? '', containerId: container.containerId ?? '', containerName: container.name ?? '', publicId: container.publicId ?? '' })
            }
            containerPageToken = containers.data.nextPageToken ?? undefined
          } while (containerPageToken)
        }
        accountPageToken = accounts.data.nextPageToken ?? undefined
      } while (accountPageToken)
      return result
    })()
    const result = await pendingRequest
    cachedAccounts = { accounts: result, expiresAt: Date.now() + 300_000 }
    pendingRequest = null
    return NextResponse.json(paginateAccounts(result, page), { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar contenedores de Tag Manager'
    if (/quota|rate limit|too many requests|429/i.test(message)) {
      blockedUntil = Date.now() + 60_000
      return NextResponse.json({ error: 'Google Tag Manager alcanzó el límite de consultas. La carga se reanudará automáticamente en un minuto.', retryAfterSeconds: 60 }, { status: 429, headers: { 'Retry-After': '60' } })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
