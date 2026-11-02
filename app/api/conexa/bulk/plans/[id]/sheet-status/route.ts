import { NextResponse } from 'next/server'
import { confirmInterpretation } from '@/lib/conexa/bulk/interpret'
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
  const chosenDone = clean(body?.values?.done)
  const chosenError = clean(body?.values?.error)
  const done = interpretation.statusVocabulary.done || chosenDone
  const error = interpretation.statusVocabulary.error || chosenError
  const updates = body?.updates ?? []
  if ((updates.some((update) => update.ok) && !done) || (updates.some((update) => !update.ok) && !error)) {
    return NextResponse.json({ needsValues: true, skipped: 'Falta elegir qué valor escribir en la columna de estado; no se escribió nada.' })
  }

  // Los valores que eligió el equipo quedan en la interpretación del cliente para las próximas cargas.
  if ((chosenDone && !interpretation.statusVocabulary.done) || (chosenError && !interpretation.statusVocabulary.error)) {
    await confirmInterpretation(access.clientId, grid, { ...interpretation, statusVocabulary: { ...interpretation.statusVocabulary, ...(done ? { done } : {}), ...(error ? { error } : {}), confirmed: true } }, access.userId).catch(() => null)
  }

  const rowNumbers = new Set(grid.rows.map((row) => row.rowNumber))
  const data = updates
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
