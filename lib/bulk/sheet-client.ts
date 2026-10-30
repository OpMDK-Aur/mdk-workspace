import { baseNameOf, newId, ratioFromDimensions, ratioFromName } from './group-assets'
import { CTAS, type BulkAdset, type BulkAsset, type CTA, type DriveLinkResult, type SheetGrid, type SheetImportEntry, type SheetImportFile } from './types'

export class SheetReadError extends Error {
  constructor(message: string, readonly needsGoogle: boolean) {
    super(message)
  }
}

async function postSheet<T>(payload: object): Promise<T> {
  const response = await fetch('/api/conexa/meta/bulk/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new SheetReadError(body?.error ?? 'No se pudo leer el sheet.', body?.code === 'google_not_connected')
  return body as T
}

export const readSheet = (url: string) => postSheet<SheetGrid>({ url })

export async function resolveDriveLinks(ids: string[]) {
  const result: Record<string, DriveLinkResult> = {}
  for (let index = 0; index < ids.length; index += 100) {
    Object.assign(result, (await postSheet<{ links: Record<string, DriveLinkResult> }>({ driveIds: ids.slice(index, index + 100) })).links)
  }
  return result
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*\|\s*/g, '|').trim()

export function matchCta(value: string): CTA | undefined {
  const key = normalize(value)
  return key ? CTAS.find((cta) => normalize(cta) === key) : undefined
}

export const MAPPING_FIELDS = [
  { key: 'campaign', label: 'Campaña', hint: 'Nombre de la campaña en Meta' },
  { key: 'adset', label: 'Conjunto', hint: 'Si no hay, uso el conjunto de la campaña' },
  { key: 'link', label: 'Link de creativos', hint: 'Archivo o carpeta de Drive' },
  { key: 'primaryText', label: 'Texto principal', hint: 'Copy del anuncio' },
  { key: 'headline', label: 'Título', hint: 'Headline' },
  { key: 'cta', label: 'CTA', hint: 'Botón' },
] as const

export type MappingField = (typeof MAPPING_FIELDS)[number]['key']
export type NameSource = { mode: 'column'; column: string } | { mode: 'today' } | { mode: 'file' }
export type SheetMapping = {
  columns: Partial<Record<MappingField, string>>
  name: NameSource
  split: 'row' | 'piece'
  filter?: { column: string; value: string }
}

const ALIASES: Record<MappingField | 'name', string[]> = {
  campaign: ['campana', 'campanas', 'campaign', 'nombre de campana', 'nombre campana'],
  adset: ['conjunto', 'conjuntos', 'conjunto de anuncios', 'adset', 'ad set'],
  link: ['link', 'link con creativos', 'creativos', 'drive', 'carpeta', 'link drive', 'piezas'],
  primaryText: ['texto principal', 'copy', 'texto', 'cuerpo', 'primary text'],
  headline: ['titulo', 'title', 'headline', 'titular'],
  cta: ['cta', 'boton', 'llamado a la accion', 'call to action'],
  name: ['anuncio', 'nombre', 'nombre del anuncio', 'pieza', 'ad name'],
}

const columnValues = (grid: SheetGrid, header: string) => {
  const index = grid.headers.indexOf(header)
  return index < 0 ? [] : grid.rows.map((row) => row.cells[index])
}

export function findCampaign(name: string, adsets: BulkAdset[]) {
  const key = normalize(name)
  if (!key) return undefined
  const adset = adsets.find((item) => normalize(item.campaignName) === key || item.campaignId === name.trim())
  return adset ? { id: adset.campaignId, name: adset.campaignName } : undefined
}

export function findAdset(name: string, adsets: BulkAdset[]) {
  const key = normalize(name)
  return key ? adsets.find((item) => normalize(item.name) === key || item.id === name.trim()) : undefined
}

// Para campaña y conjunto gana la columna cuyos valores coinciden con lo que existe en la cuenta, no solo la que se llama parecido.
export function suggestMapping(grid: SheetGrid, adsets: BulkAdset[]): SheetMapping {
  const byAlias = (field: MappingField | 'name') => grid.headers.find((header) => ALIASES[field].includes(normalize(header)))
    ?? grid.headers.find((header) => ALIASES[field].some((alias) => alias.length > 4 && normalize(header).includes(alias)))
  const byMatches = (finder: (value: string) => unknown) => {
    let best: { header: string; hits: number } | null = null
    for (const header of grid.headers) {
      const hits = columnValues(grid, header).filter((value) => value && finder(value)).length
      if (hits && (!best || hits > best.hits)) best = { header, hits }
    }
    return best?.header
  }
  const linkByContent = grid.headers.find((_, index) => grid.rows.some((row) => row.driveIds[index]?.length))

  const columns: SheetMapping['columns'] = {
    campaign: byMatches((value) => findCampaign(value, adsets)) ?? byAlias('campaign'),
    adset: byMatches((value) => findAdset(value, adsets)) ?? byAlias('adset'),
    link: linkByContent ?? byAlias('link'),
    primaryText: byAlias('primaryText'),
    headline: byAlias('headline'),
    cta: byAlias('cta'),
  }
  const nameColumn = byAlias('name')
  return { columns, name: nameColumn ? { mode: 'column', column: nameColumn } : { mode: 'today' }, split: 'piece' }
}

const storageKey = (clientId: string) => `conexa:bulk-sheet-mapping:${clientId}`

// Solo guarda nombres de columnas (no datos del cliente) para recordar cómo arma el sheet cada cliente.
export function loadMapping(clientId: string | null, grid: SheetGrid): SheetMapping | null {
  if (!clientId || typeof window === 'undefined') return null
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(clientId)) ?? 'null') as SheetMapping | null
    if (!saved?.columns) return null
    const known = (header?: string) => (header && grid.headers.includes(header) ? header : undefined)
    const columns = Object.fromEntries(Object.entries(saved.columns).map(([key, header]) => [key, known(header)])) as SheetMapping['columns']
    const name: NameSource = saved.name?.mode === 'column' ? (known(saved.name.column) ? saved.name : { mode: 'today' }) : saved.name ?? { mode: 'today' }
    const filter = saved.filter && known(saved.filter.column) ? saved.filter : undefined
    return { columns, name, split: saved.split === 'row' ? 'row' : 'piece', filter }
  } catch {
    return null
  }
}

export function saveMapping(clientId: string | null, mapping: SheetMapping) {
  if (!clientId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(clientId), JSON.stringify(mapping))
  } catch {}
}

export type PlannedRow = {
  rowNumber: number
  name: string
  primaryText: string
  headline: string
  cta?: CTA
  campaignLabel: string
  campaign?: { id: string; name: string }
  adsetOptions: BulkAdset[]
  adsetId?: string
  driveIds: string[]
}

export function planRows(grid: SheetGrid, mapping: SheetMapping, adsets: BulkAdset[]): PlannedRow[] {
  const index = (header?: string) => (header ? grid.headers.indexOf(header) : -1)
  const cell = (cells: string[], header?: string) => (index(header) >= 0 ? cells[index(header)] : '')
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const filterValue = mapping.filter?.value ? normalize(mapping.filter.value) : ''

  return grid.rows.flatMap((row) => {
    if (filterValue && normalize(cell(row.cells, mapping.filter?.column)) !== filterValue) return []
    const campaignLabel = cell(row.cells, mapping.columns.campaign)
    const campaign = findCampaign(campaignLabel, adsets)
    const adsetOptions = campaign ? adsets.filter((item) => item.campaignId === campaign.id) : adsets
    const adsetName = cell(row.cells, mapping.columns.adset)
    const adset = (adsetName && findAdset(adsetName, adsetOptions)) || (campaign ? adsetOptions.find((item) => item.status === 'ACTIVE') ?? adsetOptions[0] : undefined)
    const linkIndex = index(mapping.columns.link)
    const driveIds = linkIndex >= 0 ? row.driveIds[linkIndex] : [...new Set(row.driveIds.flat())]
    const name = mapping.name.mode === 'column' ? cell(row.cells, mapping.name.column) : mapping.name.mode === 'today' ? today : ''
    return [{
      rowNumber: row.rowNumber,
      name,
      primaryText: cell(row.cells, mapping.columns.primaryText),
      headline: cell(row.cells, mapping.columns.headline),
      cta: matchCta(cell(row.cells, mapping.columns.cta)),
      campaignLabel,
      campaign,
      adsetOptions,
      adsetId: adset?.id,
      driveIds,
    }]
  })
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
const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '')

// Descarga los archivos de Drive al navegador para que sigan el mismo camino de subida que los archivos de la PC.
export async function buildSheetEntries(rows: PlannedRow[], split: SheetMapping['split'], onProgress: (done: number, total: number) => void) {
  const links = await resolveDriveLinks([...new Set(rows.flatMap((row) => row.driveIds))])
  const rowFiles = rows.map((row) => [...new Map(row.driveIds.flatMap((id) => links[id]?.files ?? []).map((file) => [file.id, file])).values()])
  const queue = rowFiles.flatMap((files, rowIndex) => files.map((file) => ({ rowIndex, file })))
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

  const empty = rows.filter((_, index) => !assets[index].length).map((row) => ({ rowNumber: row.rowNumber, reason: row.driveIds.map((id) => links[id]?.error).find(Boolean) ?? (row.driveIds.length ? 'Sin imágenes o videos compatibles' : 'Sin link de Drive') }))

  const entries: SheetImportEntry[] = rows.flatMap((row, index) => {
    const ordered = assets[index].sort((a, b) => a.name.localeCompare(b.name))
    if (!ordered.length) return []
    const byPiece = new Map<string, BulkAsset[]>()
    for (const asset of ordered) byPiece.set(baseNameOf(asset.name), [...(byPiece.get(baseNameOf(asset.name)) ?? []), asset])
    const groups = split === 'row' ? [ordered] : [...byPiece.values()]
    return groups.map((group) => {
      const piece = stripExtension(group[0].name)
      const name = row.name ? (groups.length > 1 ? `${row.name} - ${baseNameOf(group[0].name)}` : row.name) : split === 'row' ? `fila_${row.rowNumber}` : piece
      return { name, assets: group, primaryText: row.primaryText, headline: row.headline, cta: row.cta, adsetId: row.adsetId }
    })
  })
  return { entries, failed, empty }
}
