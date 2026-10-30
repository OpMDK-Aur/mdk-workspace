import type { DriveLinkResult, SheetGrid, SheetGridRow, SheetImportFile } from '@/lib/bulk/types'

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

type DriveFile = { id: string; name: string; mimeType: string; size?: string; imageMediaMetadata?: { width?: number; height?: number }; videoMediaMetadata?: { width?: number; height?: number } }
const FILE_FIELDS = 'id,name,mimeType,size,imageMediaMetadata(width,height),videoMediaMetadata(width,height)'

const toImportFile = (file: DriveFile): SheetImportFile => ({
  id: file.id,
  name: file.name,
  mimeType: file.mimeType,
  width: file.imageMediaMetadata?.width ?? file.videoMediaMetadata?.width ?? 0,
  height: file.imageMediaMetadata?.height ?? file.videoMediaMetadata?.height ?? 0,
})

type ResolvedLink = DriveLinkResult & { isFolder: boolean }

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

const columnLetter = (index: number) => String.fromCharCode(65 + index)

// El encabezado es la primera fila con al menos dos celdas de texto y sin links: cada cliente arma su sheet distinto.
function detectHeaderIndex(rows: CellData[][]) {
  for (let index = 0; index < Math.min(rows.length, 10); index++) {
    const filled = rows[index].filter((cell) => cellText(cell))
    if (filled.length >= 2 && !rows[index].some((cell) => cellLinks(cell).length)) return index
  }
  return -1
}

export async function readSheetGrid(token: string, url: string): Promise<SheetGrid> {
  const parsed = parseSpreadsheetUrl(url)
  if (!parsed) throw new GoogleApiError('El link no es de un Google Sheet', 400)

  const meta = await google<SpreadsheetMeta>(token, `${SHEETS_API}/${parsed.id}?fields=properties.title,sheets.properties(sheetId,title)`)
  const sheet = meta.sheets.find((item) => item.properties.sheetId === parsed.gid) ?? meta.sheets[0]
  if (!sheet) throw new GoogleApiError('El sheet no tiene pestañas', 400)

  const range = encodeURIComponent(`'${sheet.properties.title.replace(/'/g, "''")}'!A1:Z${MAX_ROWS + 10}`)
  const fields = encodeURIComponent('sheets.data.rowData.values(formattedValue,hyperlink,textFormatRuns.format.link.uri)')
  const data = await google<SpreadsheetData>(token, `${SHEETS_API}/${parsed.id}?ranges=${range}&fields=${fields}`)
  const grid = (data.sheets[0]?.data?.[0]?.rowData ?? []).map((row) => row.values ?? [])

  const headerIndex = detectHeaderIndex(grid)
  if (headerIndex < 0) throw new GoogleApiError('No encontré una fila de encabezados en las primeras 10 filas', 422)

  const width = Math.max(...grid.slice(headerIndex).map((row) => row.length))
  const headerSeen = new Map<string, number>()
  const headers = Array.from({ length: width }, (_, column) => {
    const text = cellText(grid[headerIndex][column]) || `Columna ${columnLetter(column)}`
    const count = (headerSeen.get(normalize(text)) ?? 0) + 1
    headerSeen.set(normalize(text), count)
    return count > 1 ? `${text} (${count})` : text
  })

  const rows: SheetGridRow[] = []
  for (const [offset, row] of grid.slice(headerIndex + 1).entries()) {
    const cells = headers.map((_, column) => cellText(row[column]))
    if (!cells.some(Boolean)) continue
    const driveIds = headers.map((_, column) => [...new Set(cellLinks(row[column]).map(driveIdFromUrl).filter((id): id is string => Boolean(id)))])
    rows.push({ rowNumber: headerIndex + offset + 2, cells, driveIds })
    if (rows.length >= MAX_ROWS) break
  }

  return { title: meta.properties.title, sheetTitle: sheet.properties.title, headers, rows }
}

export async function resolveDriveLinks(token: string, ids: string[]): Promise<Record<string, DriveLinkResult>> {
  const entries = await Promise.all(ids.map(async (id) => {
    const { isFolder: _isFolder, ...link } = await resolveDriveLink(token, id)
    return [id, link] as const
  }))
  return Object.fromEntries(entries)
}
