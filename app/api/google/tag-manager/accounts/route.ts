import { NextResponse } from 'next/server'
import { listAllTagManagerAccounts } from '@/lib/google-tag-manager/service'

export const revalidate = 300

const PAGE_SIZE = 50

function paginateAccounts<T>(accounts: T[], page: number) {
  const start = (page - 1) * PAGE_SIZE
  return { accounts: accounts.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: accounts.length, hasMore: start + PAGE_SIZE < accounts.length }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const result = await listAllTagManagerAccounts()
  if (!result.ok) {
    const status = /pausa|límite|limitado/i.test(result.error) ? 429 : 500
    return NextResponse.json({ error: result.error, retryAfterSeconds: result.retryAfterSeconds }, { status, headers: status === 429 ? { 'Retry-After': String(result.retryAfterSeconds) } : undefined })
  }
  return NextResponse.json(paginateAccounts(result.accounts, page), { headers: { 'Cache-Control': 'private, max-age=300' } })
}
