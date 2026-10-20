import { NextResponse } from 'next/server'
import { resolveBulkClient } from '@/lib/meta-ads/bulk-access'
import { getPageNames } from '@/lib/meta-ads/pages'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const access = await resolveBulkClient(new URL(request.url).searchParams.get('clientId') ?? '')
  if ('error' in access) return access.error

  const names = await getPageNames(access.pageIds)
  return NextResponse.json({ pages: access.pageIds.map((id) => ({ id, name: names.get(id) ?? `ID ${id}` })) })
}
