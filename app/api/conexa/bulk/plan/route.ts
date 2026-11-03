import { NextResponse } from 'next/server'
import { parseSpreadsheetUrl, readSheetGrid } from '@/lib/google/sheet-import'
import { confirmInterpretation } from '@/lib/conexa/bulk/interpret'
import { discoverSiblingAccounts, loadInventory, loadLeadFormDetails } from '@/lib/conexa/bulk/inventory'
import { campaignNameKey } from '@/lib/conexa/bulk/text'
import { findPreviousRows, savePlan } from '@/lib/conexa/bulk/persistence'
import { rowIdentity } from '@/lib/conexa/bulk/resolve'
import { buildPlanContext } from '@/lib/conexa/bulk/planner'
import { bulkErrorResponse, clampText, requireBulkAccess, requireGoogle } from '@/lib/conexa/bulk/route-helpers'
import { sheetInterpretationSchema, type SheetInterpretation } from '@/lib/conexa/bulk/types'

export const runtime = 'nodejs'
export const maxDuration = 300

async function addSiblingAccounts(
  loaded: Awaited<ReturnType<typeof loadInventory>>,
  grid: Awaited<ReturnType<typeof readSheetGrid>>,
  interpretation: SheetInterpretation,
  clientName: string,
) {
  const indexes = interpretation.columns.filter((column) => column.role === 'campaign_name').map((column) => grid.headers.indexOf(column.header)).filter((index) => index >= 0)
  const known = new Set(loaded.inventory.campaigns.map((campaign) => campaignNameKey(campaign.name)))
  const missing = [...new Set(grid.rows.flatMap((row) => indexes.map((index) => (row.cells[index] ?? '').trim())).filter((name) => name && !known.has(campaignNameKey(name))))]
  if (!missing.length) return
  try {
    const siblings = await discoverSiblingAccounts(loaded.inventory.accounts, clientName, missing)
    if (!siblings.length) return
    const extra = await loadInventory(siblings.map((account) => account.id))
    loaded.inventory.accounts.push(...extra.inventory.accounts.map((account) => ({ ...account, unlinked: true })))
    loaded.inventory.campaigns.push(...extra.inventory.campaigns)
    loaded.inventory.adsets.push(...extra.inventory.adsets)
    loaded.inventory.ads.push(...extra.inventory.ads)
    Object.assign(loaded.inventory.currency, extra.inventory.currency)
    loaded.warnings.push(...extra.warnings, ...siblings.map((account) =>
      `${account.found.length} campaña${account.found.length > 1 ? 's' : ''} del sheet ${account.found.length > 1 ? 'están' : 'está'} en "${account.name}" (act_${account.id}), que no está vinculada a este cliente. La incluí en este plan; vinculala en Cuentas publicitarias para que quede fija.`))
  } catch (error) {
    loaded.warnings.push(`No pude buscar las campañas faltantes en otras cuentas: ${error instanceof Error ? error.message : 'error de Meta'}`)
  }
}

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
    await addSiblingAccounts(loaded, grid, interpretation.data, access.clientName)
    await loadLeadFormDetails(loaded.inventory).catch((error) => loaded.warnings.push(`No pude leer los datos de los formularios: ${error instanceof Error ? error.message : 'error de Meta'}`))
    const interpretationId = await confirmInterpretation(access.clientId, grid, interpretation.data, access.userId)
    const context = await buildPlanContext({
      planId: crypto.randomUUID(), clientId: access.clientId, sheetUrl: url, spreadsheetId: parsed.id, googleToken: google.accessToken, grid,
      interpretation: interpretation.data, rowFilter, inventory: loaded.inventory, inventoryWarnings: loaded.warnings, clientContext: clampText(body?.clientContext, 2000),
      batchDefaults: { cta: clampText(body?.batchDefaults?.cta, 40) || 'Más información', url: clampText(body?.batchDefaults?.url, 500) || (clampText(body?.clientContext, 2000).match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? '') }, pageIds: access.pageIds,
    })
    try {
      const previous = await findPreviousRows(parsed.id, grid.rows.map((row) => rowIdentity(context, row.rowNumber).rowKey))
      context.previousRows = {}
      for (const row of previous.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) context.previousRows[row.rowKey] = row
    } catch (error) {
      context.warnings.push(`No pude revisar si alguna fila ya se creó en un lote anterior: ${error instanceof Error ? error.message : 'error'}`)
    }
    context.planId = await savePlan(context, interpretationId, access.userId)
    return NextResponse.json({ context })
  } catch (error) {
    return bulkErrorResponse(error, google.email)
  }
}
