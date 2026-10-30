import { NextResponse } from 'next/server'
import { loadPlan } from '@/lib/conexa/bulk/persistence'
import { requireBulkAccess, requireGoogle } from '@/lib/conexa/bulk/route-helpers'
import { columnLetter } from '@/lib/conexa/bulk/text'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null) as { clientId?: string; updates?: Array<{ rowNumber: number; ok: boolean }>; values?: { done?: string; error?: string } } | null
  const access = await requireBulkAccess(body?.clientId)
  if ('error' in access) return access.error
  const plan = await loadPlan(id)
  if (!plan || plan.context.clientId !== access.clientId) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })

  const { interpretation, grid, spreadsheetId, sheetTitle } = plan.context
  const statusColumn = interpretation.columns.find((column) => column.role === 'status')
  const index = statusColumn ? grid.headers.indexOf(statusColumn.header) : -1
  if (index < 0) return NextResponse.json({ skipped: 'El sheet no tiene una columna de estado.' })
  const clean = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 60) : '') || undefined
  const done = interpretation.statusVocabulary.done || clean(body?.values?.done)
  const error = interpretation.statusVocabulary.error || clean(body?.values?.error)
  if (!done && !error) return NextResponse.json({ needsValues: true, skipped: 'Decime qué valor escribir en la columna de estado.' })

  const rowNumbers = new Set(grid.rows.map((row) => row.rowNumber))
  const data = (body?.updates ?? [])
    .filter((update) => Number.isInteger(update.rowNumber) && rowNumbers.has(update.rowNumber) && (update.ok ? done : error))
    .slice(0, 500)
    .map((update) => ({ range: `'${(sheetTitle ?? 'Sheet1').replace(/'/g, "''")}'!${columnLetter(index)}${update.rowNumber}`, values: [[update.ok ? done : error]] }))
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
