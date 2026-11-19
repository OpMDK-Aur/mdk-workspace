import { NextResponse } from 'next/server'
import { searchTagManagerContainers } from '@/lib/google-tag-manager/service'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 100

export async function GET(request: Request) {
  const url = new URL(request.url)
  const search = (url.searchParams.get('search') ?? '').slice(0, 120)
  const result = await searchTagManagerContainers(search)
  if (!result.ok) {
    const status = /límite/i.test(result.error) ? 429 : 500
    return NextResponse.json({ error: result.error, retryAfterSeconds: result.retryAfterSeconds }, { status, headers: status === 429 ? { 'Retry-After': String(result.retryAfterSeconds) } : undefined })
  }
  return NextResponse.json(
    { accounts: result.containers.slice(0, MAX_RESULTS), matchedAccounts: result.matchedAccounts, truncated: result.truncated || result.containers.length > MAX_RESULTS },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}
