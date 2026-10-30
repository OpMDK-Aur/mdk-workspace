import { NextResponse } from 'next/server'
import { parseSpreadsheetUrl, readSheetGrid } from '@/lib/google/sheet-import'
import { loadInventory } from '@/lib/conexa/bulk/inventory'
import { interpretSheet } from '@/lib/conexa/bulk/interpret'
import { persistenceEnabled } from '@/lib/conexa/bulk/persistence'
import { bulkErrorResponse, clampText, requireBulkAccess, requireGoogle } from '@/lib/conexa/bulk/route-helpers'
import type { InterpretResponse } from '@/lib/conexa/bulk/types'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const access = await requireBulkAccess(body?.clientId)
  if ('error' in access) return access.error
  const url = clampText(body?.url, 500)
  const parsed = parseSpreadsheetUrl(url)
  if (!parsed) return NextResponse.json({ error: 'El link no es de un Google Sheet.' }, { status: 400 })
  const google = await requireGoogle()
  if ('error' in google) return google.error

  try {
    const [grid, { inventory }] = await Promise.all([readSheetGrid(google.accessToken, url), loadInventory([...access.accountIds])])
    const result = await interpretSheet({ clientId: access.clientId, grid, clientContext: clampText(body?.clientContext, 2000), inventory, userId: access.userId })
    return NextResponse.json({ ...result, grid, spreadsheetId: parsed.id, persisted: persistenceEnabled() } satisfies InterpretResponse)
  } catch (error) {
    return bulkErrorResponse(error, google.email)
  }
}
