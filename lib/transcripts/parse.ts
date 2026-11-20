/** Sufijos con los que Google Meet y Gemini nombran los documentos que generan. */
const SUFFIX = /\s*[-–—]\s*(transcript|transcripci[oó]n|notas de gemini|notes by gemini)\s*$/i
/** "Reunión (2026-11-20 15:00 GMT-3)" */
const PAREN_DATE = /\s*\((\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*(?:GMT|UTC)\s*([+-]\d{1,2})(?::?(\d{2}))?\)\s*$/i
/** "Reunión - 2026/11/20 15:00 GMT-03:00" */
const DASH_DATE = /\s*[-–—]\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(?:GMT|UTC)\s*([+-]\d{1,2})(?::?(\d{2}))?\s*$/i

export const MAX_TRANSCRIPT_CHARS = 300_000

export function isTranscriptDocName(name: string) {
  return SUFFIX.test(name.trim())
}

/**
 * Separa el título de la reunión y su fecha del nombre del documento. Si el
 * nombre no sigue el formato de Meet, devuelve el nombre completo sin fecha.
 */
export function parseTranscriptDocName(name: string): { meetingTitle: string; meetingDate: string | null } {
  let rest = name.trim().replace(SUFFIX, '')
  let meetingDate: string | null = null
  const match = rest.match(PAREN_DATE) ?? rest.match(DASH_DATE)
  if (match) {
    const [, year, month, day, hour, minute, offsetHours, offsetMinutes] = match
    const sign = offsetHours.startsWith('-') ? '-' : '+'
    const offset = `${sign}${offsetHours.replace(/[+-]/, '').padStart(2, '0')}:${(offsetMinutes ?? '00').padStart(2, '0')}`
    const parsed = new Date(`${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:00${offset}`)
    if (!Number.isNaN(parsed.getTime())) meetingDate = parsed.toISOString()
    rest = rest.slice(0, match.index).trim()
  }
  return { meetingTitle: rest || name.trim(), meetingDate }
}

/** ID de un Google Doc a partir de su link (o el ID solo). */
export function extractGoogleDocId(input: string): string | null {
  const value = input.trim()
  const fromUrl = value.match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/)
  if (fromUrl) return fromUrl[1]
  return /^[a-zA-Z0-9_-]{25,}$/.test(value) ? value : null
}

/** Limpia el texto exportado: saca el BOM, normaliza saltos de línea y recorta a un largo razonable. */
export function cleanTranscriptText(text: string) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TRANSCRIPT_CHARS)
}

/** Saca encabezados, números de cue y marcas de tiempo de archivos .vtt/.srt, dejando solo lo que se dijo. */
export function stripSubtitleTimings(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => {
      const value = line.trim()
      if (/^WEBVTT/i.test(value) || /^(NOTE|STYLE|REGION)\b/.test(value)) return false
      if (/^\d+$/.test(value)) return false
      return !/^\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}/.test(value)
    })
    .join('\n')
}

/** Primer tramo legible de la transcripción para mostrar en el comentario. */
export function transcriptExcerpt(text: string, maxChars = 500) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxChars) return flat
  const cut = flat.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > maxChars * 0.6 ? lastSpace : maxChars)}…`
}
