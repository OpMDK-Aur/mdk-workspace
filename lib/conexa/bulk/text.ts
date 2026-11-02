export const normalizeText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export const containsText = (haystack: string, needle: string) => {
  const key = normalizeText(needle)
  return Boolean(key) && normalizeText(haystack).includes(key)
}

// Relleno de plantilla: solo puntuación, guiones, espacios o "N/A" cuenta como celda vacía.
export const isBlankValue = (value: string | undefined) => {
  const key = normalizeText(value ?? '')
  return !key || key === 'n/a' || key === 'na' || !/[a-z0-9]/.test(key)
}
export const cleanValue = (value: string | undefined) => (isBlankValue(value) ? '' : (value ?? '').trim())
// Separa por "|", salto de línea o punto final de oración (no corta URLs ni decimales).
export const splitInstructions = (text: string) => text.split(/\||\r?\n|\.(?=\s|$)/).map((part) => part.trim()).filter((part) => !isBlankValue(part))

export const sameText = (a: string, b: string) => Boolean(normalizeText(a)) && normalizeText(a) === normalizeText(b)

// Nombres de Meta: ignora separadores ("|", "-", "_", "/", espacios) y unifica O→0 en códigos (OKM ↔ 0KM, B2B, 6OO).
export const campaignNameKey = (value: string) => normalizeText(value).split(/[^a-z0-9]+/).filter(Boolean)
  .map((token) => (/\d/.test(token) || /^o+km$/.test(token) ? token.replace(/o/g, '0') : token)).join(' ')
export const sameCampaignName = (a: string, b: string) => Boolean(campaignNameKey(a)) && campaignNameKey(a) === campaignNameKey(b)

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
