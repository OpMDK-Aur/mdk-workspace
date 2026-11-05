import 'server-only'
import { parse } from 'csv-parse/sync'
import { read, utils } from 'xlsx'

export type BudgetSheetKey = 'general' | 'meta' | 'google' | 'objetivosCpl'
export type BudgetRow = Record<string, unknown>
export type BudgetWorkbook = Record<BudgetSheetKey, BudgetRow[]> & {
  fileName: string
  sheetNames: string[]
  rowCounts: Record<string, number>
}

const EMPTY_SHEETS: Record<BudgetSheetKey, BudgetRow[]> = {
  general: [],
  meta: [],
  google: [],
  objetivosCpl: [],
}

export function normalizeBudgetHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeSheetName(value: string): BudgetSheetKey | null {
  const key = normalizeBudgetHeader(value)
  if (key === 'general') return 'general'
  if (key === 'meta' || key.startsWith('metaads')) return 'meta'
  if (key === 'google' || key === 'googleads') return 'google'
  if (key.startsWith('objetivoscpl') || key === 'cplobjetivos') return 'objetivosCpl'
  return null
}

function detectCsvSheet(headers: string[], fileName: string): BudgetSheetKey {
  const normalized = headers.map(normalizeBudgetHeader)
  const fileHint = normalizeBudgetHeader(fileName)
  if (normalized.includes('cplpromedio') || fileHint.includes('objetivoscpl')) return 'objetivosCpl'
  if (normalized.includes('objetivomaximodeleads') || fileHint.includes('google')) return 'google'
  if (normalized.includes('modelos') && normalized.includes('objetivo')) return 'meta'
  if (normalized.includes('campana') && normalized.includes('mes')) return 'general'
  return 'general'
}

function recordsFromCsv(buffer: Buffer, fileName: string) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','
  const rows = parse(text, {
    bom: true,
    columns: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as BudgetRow[]
  const headers = rows.length ? Object.keys(rows[0]) : []
  const key = detectCsvSheet(headers, fileName)
  return { [key]: rows } as Partial<Record<BudgetSheetKey, BudgetRow[]>>
}

function recordsFromWorkbook(buffer: Buffer) {
  const workbook = read(buffer, { type: 'buffer', cellDates: true })
  const sheets: Partial<Record<BudgetSheetKey, BudgetRow[]>> = {}
  const sheetNames: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const key = normalizeSheetName(sheetName)
    if (!key) continue
    const rows = utils.sheet_to_json<BudgetRow>(workbook.Sheets[sheetName], {
      defval: null,
      raw: false,
      dateNF: 'yyyy-mm-dd',
    })
    sheets[key] = [...(sheets[key] ?? []), ...rows]
    sheetNames.push(sheetName.trim())
  }

  return { sheets, sheetNames }
}

export function parseDashboardBudget(buffer: Buffer, fileName: string, contentType = ''): BudgetWorkbook {
  const extension = fileName.toLowerCase().split('.').pop()
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new Error('Formato no compatible. Subí un archivo CSV o XLSX.')
  }

  const parsed = extension === 'csv' || contentType.toLowerCase().includes('csv')
    ? { sheets: recordsFromCsv(buffer, fileName), sheetNames: [fileName] }
    : recordsFromWorkbook(buffer)
  const sheets = { ...EMPTY_SHEETS, ...parsed.sheets }
  const rowCounts = Object.fromEntries(Object.entries(sheets).map(([key, rows]) => [key, rows.length]))
  const totalRows = Object.values(rowCounts).reduce((total, count) => total + count, 0)

  if (!totalRows) {
    throw new Error('El archivo no contiene filas de presupuesto en las hojas reconocidas.')
  }

  return {
    ...sheets,
    fileName,
    sheetNames: parsed.sheetNames,
    rowCounts,
  }
}

export function parseBudgetAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  let text = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!text) return 0
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.')
  else text = text.replace(/,/g, '')
  const amount = Number(text)
  return Number.isFinite(amount) ? amount : 0
}

export function parseBudgetPercent(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1 ? value / 100 : value
  const amount = parseBudgetAmount(value)
  return String(value ?? '').includes('%') || amount > 1 ? amount / 100 : amount
}
