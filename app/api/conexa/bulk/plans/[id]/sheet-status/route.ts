import { NextResponse } from 'next/server'
import { loadPlan } from '@/lib/conexa/bulk/persistence'
import { requireBulkAccess, requireGoogle } from '@/lib/conexa/bulk/route-helpers'
import { columnLetter, normalizeText } from '@/lib/conexa/bulk/text'

export const runtime = 'nodejs'

// "EN REVISIÓN" con el formato del sheet: si ya aparece se copia tal cual; si no, se sigue la capitalización de los demás valores.
function reviewValue(cells: string[]) {
  const values = cells.map((cell) => cell.trim()).filter((cell) => /\p{L}/u.test(cell))
  const existing = values.find((cell) => normalizeText(cell) === 'en revision')
  if (existing) return existing
  const upper = values.filter((cell) => cell === cell.toUpperCase()).length
  if (!values.length || upper >= values.length / 2) return 'EN REVISIÓN'
  const lower = values.filter((cell) => cell === cell.toLowerCase()).length
  return lower > values.length / 2 ? 'en revisión' : 'En revisión'
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null) as { clientId?: string; updates?: Array<{ rowNumber: number; ok: boolean }> } | null
  const access = await requireBulkAccess(body?.clientId)
  if ('error' in access) return access.error
  const plan = await loadPlan(id)
  if (!plan || plan.context.clientId !== access.clientId) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })

  const { interpretation, grid, spreadsheetId, sheetTitle } = plan.context
  const statusColumn = interpretation.columns.find((column) => column.role === 'status')
  const index = statusColumn ? grid.headers.indexOf(statusColumn.header) : -1
  if (index < 0) return NextResponse.json({ skipped: 'El sheet no tiene una columna de estado: no se escribió nada en el sheet.' })

  const value = reviewValue(grid.rows.map((row) => row.cells[index] ?? ''))
  // Las filas que fallaron conservan su valor original para volver a aparecer como pendientes.
  const rowNumbers = new Set(grid.rows.map((row) => row.rowNumber))
  const okRows = [...new Set((body?.updates ?? []).filter((update) => update.ok === true && Number.isInteger(update.rowNumber) && rowNumbers.has(update.rowNumber)).map((update) => update.rowNumber))]
  const data = okRows
    .slice(0, 500)
    .map((rowNumber) => ({ range: `'${(sheetTitle ?? 'Sheet1').replace(/'/g, "''")}'!${columnLetter(index)}${rowNumber}`, values: [[value]] }))
  if (!data.length) return NextResponse.json({ updated: 0 })

  const google = await requireGoogle()
  if ('error' in google) return google.error
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${google.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  })
  if (!response.ok) {
    const scope = response.status === 403 ? ' Reconectá Google con permiso de edición o compartí el sheet como editor.' : ''
    return NextResponse.json({ error: `No pude actualizar el estado en el sheet.${scope}` }, { status: 502 })
  }
  return NextResponse.json({ updated: data.length })
}
