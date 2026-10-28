import type { SheetImportFile, SheetImportResult, SheetImportRow } from '@/lib/bulk/types'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files'
const MAX_ROWS = 200
const MAX_FILES_PER_FOLDER = 50
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

type Column = 'name' | 'primaryText' | 'headline' | 'cta' | 'adset'

const HEADER_ALIASES: Record<Column, string[]> = {
  name: ['anuncio', 'nombre', 'nombre del anuncio', 'pieza', 'creativo', 'ad', 'ad name'],
  primaryText: ['texto principal', 'copy', 'texto', 'cuerpo', 'primary text', 'descripcion del anuncio'],
  headline: ['titulo', 'title', 'headline', 'titular'],
  cta: ['cta', 'boton', 'llamado a la accion', 'call to action'],
  adset: ['conjunto', 'conjunto de anuncios', 'adset', 'ad set'],
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[:*]/g, '').trim()

export function parseSpreadsheetUrl(input: string) {
  const id = input.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? (/^[\w-]{25,}$/.test(input.trim()) ? input.trim() : null)
  const gid = input.match(/[#?&]gid=(\d+)/)?.[1] ?? null
  return id ? { id, gid: gid === null ? null : Number(gid) } : null
}

export function driveIdFromUrl(url: string) {
  if (!/drive\.google\.com|docs\.google\.com\/(file|uc)/.test(url)) return null
  return url.match(/\/(?:file\/d|folders|d)\/([\w-]{10,})/)?.[1] ?? url.match(/[?&]id=([\w-]{10,})/)?.[1] ?? null
}

async function google<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new GoogleApiError(body?.error?.message ?? `Google respondió ${response.status}`, response.status)
  }
  return response.json() as Promise<T>
}

type CellData = { formattedValue?: string; hyperlink?: string; textFormatRuns?: Array<{ format?: { link?: { uri?: string } } }> }
type SpreadsheetMeta = { properties: { title: string }; sheets: Array<{ properties: { sheetId: number; title: string } }> }
type SpreadsheetData = { sheets: Array<{ data?: Array<{ rowData?: Array<{ values?: CellData[] }> }> }> }

const cellText = (cell?: CellData) => (cell?.formattedValue ?? '').trim()
const cellLinks = (cell?: CellData) => {
  const links = [cell?.hyperlink, ...(cell?.textFormatRuns ?? []).map((run) => run.format?.link?.uri), ...(cellText(cell).match(/https?:\/\/\S+/g) ?? [])]
  return links.filter((link): link is string => Boolean(link))
}

function detectHeader(rows: CellData[][]) {
  for (let index = 0; index < Math.min(rows.length, 10); index++) {
    const columns: Partial<Record<Column, number>> = {}
    rows[index].forEach((cell, column) => {
      const text = normalize(cellText(cell))
      const match = (Object.keys(HEADER_ALIASES) as Column[]).find((key) => columns[key] === undefined && HEADER_ALIASES[key].includes(text))
      if (match) columns[match] = column
    })
    if (columns.primaryText !== undefined || columns.headline !== undefined) return { index, columns }
  }
  return null
}

type DriveFile = { id: string; name: string; mimeType: string; size?: string; imageMediaMetadata?: { width?: number; height?: number }; videoMediaMetadata?: { width?: number; height?: number } }
const FILE_FIELDS = 'id,name,mimeType,size,imageMediaMetadata(width,height),videoMediaMetadata(width,height)'

const toImportFile = (file: DriveFile): SheetImportFile => ({
  id: file.id,
  name: file.name,
  mimeType: file.mimeType,
  width: file.imageMediaMetadata?.width ?? file.videoMediaMetadata?.width ?? 0,
  height: file.imageMediaMetadata?.height ?? file.videoMediaMetadata?.height ?? 0,
})

type ResolvedLink = { isFolder: boolean; files: SheetImportFile[]; skipped: number; error?: string }

async function resolveDriveLink(token: string, id: string): Promise<ResolvedLink> {
  try {
    const item = await google<DriveFile>(token, `${DRIVE_API}/${id}?fields=${FILE_FIELDS}&supportsAllDrives=true`)
    if (item.mimeType !== FOLDER_MIME) {
      return ACCEPTED_MIME.includes(item.mimeType) ? { isFolder: false, files: [toImportFile(item)], skipped: 0 } : { isFolder: false, files: [], skipped: 1 }
    }
    const query = encodeURIComponent(`'${id}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`)
    const list = await google<{ files: DriveFile[] }>(token, `${DRIVE_API}?q=${query}&fields=files(${FILE_FIELDS})&pageSize=${MAX_FILES_PER_FOLDER}&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`)
    const accepted = list.files.filter((file) => ACCEPTED_MIME.includes(file.mimeType))
    return { isFolder: true, files: accepted.map(toImportFile), skipped: list.files.length - accepted.length }
  } catch (error) {
    const status = error instanceof GoogleApiError ? error.status : 0
    return { isFolder: false, files: [], skipped: 0, error: status === 404 || status === 403 ? 'Sin acceso al link de Drive' : 'No se pudo leer el link de Drive' }
  }
}

const stem = (name: string) => normalize(name.replace(/\.[^.]+$/, '')).replace(/[_\-\s]+/g, '')

// Una carpeta compartida por varias filas se reparte por nombre: cada fila toma los archivos cuyo nombre contiene el de la pieza.
function filesForRow(name: string, link: ResolvedLink, sharedFolder: boolean) {
  if (!link.isFolder || !sharedFolder || !name) return link.files
  const key = stem(name)
  const matches = link.files.filter((file) => stem(file.name).includes(key))
  return matches.length ? matches : []
}

export async function readSheetImport(token: string, url: string): Promise<SheetImportResult> {
  const parsed = parseSpreadsheetUrl(url)
  if (!parsed) throw new GoogleApiError('El link no es de un Google Sheet', 400)

  const meta = await google<SpreadsheetMeta>(token, `${SHEETS_API}/${parsed.id}?fields=properties.title,sheets.properties(sheetId,title)`)
  const sheet = meta.sheets.find((item) => item.properties.sheetId === parsed.gid) ?? meta.sheets[0]
  if (!sheet) throw new GoogleApiError('El sheet no tiene pestañas', 400)

  const range = encodeURIComponent(`'${sheet.properties.title.replace(/'/g, "''")}'!A1:Z${MAX_ROWS + 10}`)
  const fields = encodeURIComponent('sheets.data.rowData.values(formattedValue,hyperlink,textFormatRuns.format.link.uri)')
  const data = await google<SpreadsheetData>(token, `${SHEETS_API}/${parsed.id}?ranges=${range}&fields=${fields}`)
  const grid = (data.sheets[0]?.data?.[0]?.rowData ?? []).map((row) => row.values ?? [])

  const header = detectHeader(grid)
  if (!header) throw new GoogleApiError('No encontré columnas de "Texto principal" o "Título" en las primeras filas', 422)

  const { columns } = header
  const pick = (row: CellData[], column?: number) => (column === undefined ? '' : cellText(row[column]))

  // Links sueltos sobre el encabezado (ej. "Carpeta: https://drive…") aplican a las filas que no tienen uno propio.
  let inheritedLink: string | null = grid.slice(0, header.index).flatMap((row) => row.flatMap(cellLinks)).map(driveIdFromUrl).find(Boolean) ?? null

  const draft: Array<Omit<SheetImportRow, 'files' | 'skipped' | 'error'> & { driveIds: string[] }> = []
  for (const [offset, row] of grid.slice(header.index + 1).entries()) {
    const primaryText = pick(row, columns.primaryText)
    const headline = pick(row, columns.headline)
    const name = pick(row, columns.name)
    const ownIds = [...new Set(row.flatMap(cellLinks).map(driveIdFromUrl).filter((id): id is string => Boolean(id)))]
    if (!primaryText && !headline && !name) {
      if (ownIds.length) inheritedLink = ownIds[0]
      continue
    }
    draft.push({
      rowNumber: header.index + offset + 2,
      name,
      primaryText,
      headline,
      cta: pick(row, columns.cta),
      adsetName: pick(row, columns.adset),
      driveIds: ownIds.length ? ownIds : inheritedLink ? [inheritedLink] : [],
    })
    if (draft.length >= MAX_ROWS) break
  }

  const uniqueIds = [...new Set(draft.flatMap((row) => row.driveIds))]
  const resolved = new Map(await Promise.all(uniqueIds.map(async (id) => [id, await resolveDriveLink(token, id)] as const)))
  const usage = new Map<string, number>()
  for (const row of draft) for (const id of row.driveIds) usage.set(id, (usage.get(id) ?? 0) + 1)

  const rows: SheetImportRow[] = draft.map(({ driveIds, ...row }) => {
    const links = driveIds.map((id) => ({ id, link: resolved.get(id)! }))
    const files = links.flatMap(({ id, link }) => filesForRow(row.name, link, (usage.get(id) ?? 0) > 1))
    const unique = [...new Map(files.map((file) => [file.id, file])).values()]
    const error = links.find(({ link }) => link.error)?.link.error ?? (!driveIds.length ? 'Sin link de Drive' : !unique.length ? 'No hay imágenes o videos compatibles' : undefined)
    return { ...row, files: unique, skipped: links.reduce((sum, { link }) => sum + link.skipped, 0), ...(error && { error }) }
  })

  return { title: meta.properties.title, sheetTitle: sheet.properties.title, rows }
}
