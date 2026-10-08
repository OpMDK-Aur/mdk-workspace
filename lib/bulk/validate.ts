import { isFeedRatio } from './group-assets'
import { PRIMARY_TEXT_LIMIT, type BulkRow } from './types'

export type RowState = 'listo' | 'revisar' | 'borrador' | 'error' | 'publicado'
export type RowIssue = { level: 'warn' | 'info' | 'error'; text: string }

export function isDraft(row: BulkRow) {
  return row.assets.length === 0 || row.assets.every((asset) => asset.pending)
}

export function validateRow(row: BulkRow): { state: RowState; issues: RowIssue[] } {
  if (row.status === 'done') return { state: 'publicado', issues: [] }
  if (row.status === 'error') return { state: 'error', issues: [{ level: 'error', text: row.error ?? 'Meta rechazó el anuncio.' }] }
  if (isDraft(row)) return { state: 'borrador', issues: [{ level: 'info', text: 'Esperando archivo de Diseño. Queda en borrador.' }] }

  const issues: RowIssue[] = []
  if (!row.primaryText.trim()) issues.push({ level: 'warn', text: 'Falta el texto principal.' })
  else if (row.primaryText.length > PRIMARY_TEXT_LIMIT) issues.push({ level: 'warn', text: `El texto principal supera ${PRIMARY_TEXT_LIMIT} caracteres.` })
  if (!row.headline.trim()) issues.push({ level: 'warn', text: 'Falta el título.' })

  const hasFeed = row.assets.some((asset) => isFeedRatio(asset.ratio))
  const hasVertical = row.assets.some((asset) => asset.ratio === '9:16')
  if (hasFeed && !hasVertical) issues.push({ level: 'info', text: 'Sin 9:16: Stories usa recorte automático' })

  return { state: issues.some((issue) => issue.level === 'warn') ? 'revisar' : 'listo', issues }
}
