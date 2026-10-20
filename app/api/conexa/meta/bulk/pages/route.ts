import { NextResponse } from 'next/server'
import { resolveBulkClient } from '@/lib/meta-ads/bulk-access'
import { listAccessiblePages } from '@/lib/meta-ads/pages'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const access = await resolveBulkClient(new URL(request.url).searchParams.get('clientId') ?? '')
  if ('error' in access) return access.error

  const names = new Map<string, string>()
  try {
    for (const page of await listAccessiblePages()) names.set(page.id, page.name)
  } catch {
    // Without names the IDs are still selectable.
  }
  return NextResponse.json({ pages: access.pageIds.map((id) => ({ id, name: names.get(id) ?? `ID ${id}` })) })
}
