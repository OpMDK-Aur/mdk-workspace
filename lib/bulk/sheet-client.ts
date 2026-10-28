import { newId, ratioFromDimensions, ratioFromName } from './group-assets'
import { CTAS, type BulkAdset, type BulkAsset, type CTA, type SheetImportEntry, type SheetImportFile, type SheetImportResult, type SheetImportRow } from './types'

export class SheetReadError extends Error {
  constructor(message: string, readonly needsGoogle: boolean) {
    super(message)
  }
}

export async function readSheet(url: string): Promise<SheetImportResult> {
  const response = await fetch('/api/conexa/meta/bulk/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new SheetReadError(body?.error ?? 'No se pudo leer el sheet.', body?.code === 'google_not_connected')
  return body as SheetImportResult
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function matchCta(value: string): CTA | undefined {
  const key = normalize(value)
  return key ? CTAS.find((cta) => normalize(cta) === key) : undefined
}

export function matchAdset(name: string, adsets: BulkAdset[]) {
  const key = normalize(name)
  return key ? adsets.find((adset) => normalize(adset.name) === key || adset.id === name.trim()) : undefined
}

async function downloadFile(file: SheetImportFile): Promise<BulkAsset> {
  const response = await fetch(`/api/conexa/meta/bulk/drive-file?id=${encodeURIComponent(file.id)}`)
  if (!response.ok) throw new Error(`No se pudo descargar ${file.name}`)
  const blob = await response.blob()
  const local = new File([blob], file.name, { type: file.mimeType })
  return {
    id: newId('asset'),
    file: local,
    name: file.name,
    kind: file.mimeType.startsWith('video/') ? 'video' : 'image',
    url: URL.createObjectURL(local),
    ratio: ratioFromName(file.name) ?? ratioFromDimensions(file.width, file.height),
  }
}

const CONCURRENCY = 4

// Descarga los archivos de Drive al navegador para que sigan el mismo camino de subida que los archivos de la PC.
export async function buildSheetEntries(rows: SheetImportRow[], adsets: BulkAdset[], onProgress: (done: number, total: number) => void) {
  const queue = rows.flatMap((row, rowIndex) => row.files.map((file) => ({ rowIndex, file })))
  const assets: BulkAsset[][] = rows.map(() => [])
  let failed = 0
  let done = 0
  onProgress(0, queue.length)

  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (cursor < queue.length) {
      const { rowIndex, file } = queue[cursor++]
      try {
        assets[rowIndex].push(await downloadFile(file))
      } catch {
        failed++
      }
      onProgress(++done, queue.length)
    }
  }))

  const entries: SheetImportEntry[] = rows.flatMap((row, index) => {
    if (!assets[index].length) return []
    const ordered = assets[index].sort((a, b) => a.name.localeCompare(b.name))
    return [{
      name: (row.name || row.files[0]?.name.replace(/\.[^.]+$/, '') || `fila_${row.rowNumber}`).toLowerCase(),
      assets: ordered,
      primaryText: row.primaryText,
      headline: row.headline,
      cta: matchCta(row.cta),
      adsetId: matchAdset(row.adsetName, adsets)?.id,
    }]
  })
  return { entries, failed }
}
