export const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export const containsText = (haystack: string, needle: string) => {
  const key = normalizeText(needle)
  return Boolean(key) && normalizeText(haystack).includes(key)
}

export const sameText = (a: string, b: string) => Boolean(normalizeText(a)) && normalizeText(a) === normalizeText(b)

// FNV-1a: estable entre servidor y navegador, suficiente para claves de idempotencia y hash de encabezados.
export function hashText(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const headersHash = (headers: string[]) => hashText(headers.map(normalizeText).join('|'))

export const tokens = (value: string) => normalizeText(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2)

export function tokenOverlap(a: string, b: string) {
  const left = new Set(tokens(a))
  const right = tokens(b)
  return right.filter((token) => left.has(token)).length
}

export function todayDDMMYYYY(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`
}

export function parseBudget(value: string) {
  const cleaned = value.replace(/[^\d.,]/g, '')
  if (!cleaned) return undefined
  const normalized = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

export const columnLetter = (index: number) => {
  let letter = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) letter = String.fromCharCode(65 + ((value - 1) % 26)) + letter
  return letter
}
