import type { DriveFileRef } from './types'

export type SheetFormat = '1:1' | '4:5' | '9:16' | '16:9'
export type PlacementSlot = 'feed' | 'vertical' | 'other'
export type FormatFile = DriveFileRef & { format: SheetFormat }
export type IgnoredFile = { file: DriveFileRef; reason: string }

const TARGETS: Array<[SheetFormat, number]> = [['1:1', 1], ['4:5', 4 / 5], ['9:16', 9 / 16], ['16:9', 16 / 9]]
const TOLERANCE = 0.02
const SUPPORTED_MIME = /^(image\/(jpeg|png)|video\/(mp4|quicktime))$/i

export const SLOT_LABEL: Record<PlacementSlot, string> = { feed: 'Feed', vertical: 'Stories y Reels', other: 'Otras ubicaciones' }

export function detectFormat(width: number, height: number): SheetFormat | null {
  if (!width || !height) return null
  const ratio = width / height
  return TARGETS.find(([, target]) => Math.abs(ratio - target) / target <= TOLERANCE)?.[0] ?? null
}

export function classifyFiles(files: DriveFileRef[]): { valid: FormatFile[]; ignored: IgnoredFile[] } {
  const valid: FormatFile[] = []
  const ignored: IgnoredFile[] = []
  for (const file of files) {
    if (!SUPPORTED_MIME.test(file.mimeType)) { ignored.push({ file, reason: 'tipo de archivo no soportado' }); continue }
    const format = detectFormat(file.width, file.height)
    if (!format) { ignored.push({ file, reason: file.width && file.height ? `${file.width}×${file.height} no es 1:1, 4:5, 9:16 ni 16:9` : 'sin dimensiones en Drive' }); continue }
    valid.push({ ...file, format })
  }
  return { valid, ignored }
}

export const fileFormat = (file: DriveFileRef): SheetFormat | null => detectFormat(file.width, file.height)

export const duplicatedFormats = (files: FormatFile[]) => {
  const counts = new Map<SheetFormat, number>()
  for (const file of files) counts.set(file.format, (counts.get(file.format) ?? 0) + 1)
  return [...counts].filter(([, count]) => count > 1).map(([format]) => format)
}

// Feed: 4:5 o 1:1 · Stories y Reels: 9:16 · el resto lo adapta Meta desde el formato más cercano.
export function assignPlacements(files: FormatFile[]) {
  const byFormat = (format: SheetFormat) => files.find((file) => file.format === format)
  const feed = byFormat('4:5') ?? byFormat('1:1')
  const vertical = byFormat('9:16')
  const other = byFormat('1:1') ?? byFormat('16:9') ?? feed ?? vertical
  const slots = new Map<string, PlacementSlot[]>()
  const add = (file: FormatFile | undefined, slot: PlacementSlot) => { if (file) slots.set(file.id, [...(slots.get(file.id) ?? []), slot]) }
  add(feed, 'feed')
  add(vertical, 'vertical')
  add(other, 'other')
  const warnings: string[] = []
  if (!vertical && feed) warnings.push(`Sin 9:16: Stories y Reels usarán el ${feed.format}`)
  if (!feed && vertical) warnings.push('Sin 4:5 ni 1:1: el Feed usará el 9:16')
  for (const file of files) if (!slots.has(file.id)) warnings.push(`El ${file.format} (${file.name}) no se asigna a ninguna ubicación`)
  return { slots, warnings, feed, vertical, other }
}
