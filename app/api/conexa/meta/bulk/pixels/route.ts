import { NextResponse } from 'next/server'
import { normalizeAccountId, publishErrorResponse, resolveBulkClient } from '@/lib/meta-ads/bulk-access'
import { listPixels } from '@/lib/meta-ads/publish'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const access = await resolveBulkClient(params.get('clientId') ?? '')
  if ('error' in access) return access.error
  const accountId = normalizeAccountId(params.get('accountId') ?? '')
  if (!access.accountIds.has(accountId)) return NextResponse.json({ error: 'La cuenta publicitaria no pertenece a este cliente.' }, { status: 403 })
  try {
    return NextResponse.json({ pixels: await listPixels(accountId) })
  } catch (cause) {
    return publishErrorResponse(cause)
  }
}
