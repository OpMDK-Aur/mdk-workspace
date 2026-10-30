import { NextResponse } from 'next/server'
import { parseSpreadsheetUrl, readSheetGrid } from '@/lib/google/sheet-import'
import { confirmInterpretation } from '@/lib/conexa/bulk/interpret'
import { loadInventory } from '@/lib/conexa/bulk/inventory'
import { savePlan } from '@/lib/conexa/bulk/persistence'
import { buildPlanContext } from '@/lib/conexa/bulk/planner'
import { bulkErrorResponse, clampText, requireBulkAccess, requireGoogle } from '@/lib/conexa/bulk/route-helpers'
import { sheetInterpretationSchema } from '@/lib/conexa/bulk/types'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const access = await requireBulkAccess(body?.clientId)
  if ('error' in access) return access.error
  const url = clampText(body?.url, 500)
  const parsed = parseSpreadsheetUrl(url)
  if (!parsed) return NextResponse.json({ error: 'El link no es de un Google Sheet.' }, { status: 400 })
  const interpretation = sheetInterpretationSchema.safeParse(body?.interpretation)
  if (!interpretation.success) return NextResponse.json({ error: 'La interpretación no es válida.' }, { status: 400 })
  const rowFilter = body?.rowFilter && typeof body.rowFilter.column === 'string' && Array.isArray(body.rowFilter.values)
    ? { column: clampText(body.rowFilter.column, 200), values: body.rowFilter.values.filter((value: unknown): value is string => typeof value === 'string').slice(0, 50) }
    : undefined
  const google = await requireGoogle()
  if ('error' in google) return google.error

  try {
    const [grid, loaded] = await Promise.all([readSheetGrid(google.accessToken, url), loadInventory([...access.accountIds])])
    const interpretationId = await confirmInterpretation(access.clientId, grid, interpretation.data, access.userId)
    const context = await buildPlanContext({
      planId: crypto.randomUUID(), clientId: access.clientId, sheetUrl: url, spreadsheetId: parsed.id, googleToken: google.accessToken, grid,
      interpretation: interpretation.data, rowFilter, inventory: loaded.inventory, inventoryWarnings: loaded.warnings, clientContext: clampText(body?.clientContext, 2000),
      batchDefaults: { cta: clampText(body?.batchDefaults?.cta, 40) || 'Más información', url: clampText(body?.batchDefaults?.url, 500) }, pageIds: access.pageIds,
    })
    context.planId = await savePlan(context, interpretationId, access.userId)
    return NextResponse.json({ context })
  } catch (error) {
    return bulkErrorResponse(error, google.email)
  }
}
