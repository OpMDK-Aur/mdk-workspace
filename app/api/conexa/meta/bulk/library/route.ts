import { NextResponse } from 'next/server'
import { publishErrorResponse, resolveBulkClient } from '@/lib/meta-ads/bulk-access'
import { listLibraryAds } from '@/lib/meta-ads/publish'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const access = await resolveBulkClient(params.get('clientId') ?? '')
  if ('error' in access) return access.error

  const requested = (params.get('accountIds') ?? '').split(',').map((id) => id.replace(/^act_/, '').trim()).filter(Boolean)
  const accountIds = (requested.length ? requested.filter((id) => access.accountIds.has(id)) : [...access.accountIds]).slice(0, 10)
  if (!accountIds.length) return NextResponse.json({ ads: [] })

  const results = await Promise.allSettled(accountIds.map((id) => listLibraryAds(id)))
  const ads = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  if (!ads.length) {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure) return publishErrorResponse(failure.reason)
  }
  ads.sort((a, b) => b.createdTime.localeCompare(a.createdTime))
  return NextResponse.json({ ads })
}
