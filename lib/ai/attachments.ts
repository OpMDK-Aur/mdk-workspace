/**
 * Reglas compartidas (cliente + servidor) para los archivos que se pueden
 * adjuntar en el chat del Multiagente. Mantenerlas en un solo lugar evita que
 * el input del formulario acepte algo que el backend después rechaza (o
 * viceversa).
 */

export const ATTACHMENT_MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15MB por archivo
export const ATTACHMENT_MAX_COUNT = 5 // por mensaje

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const SPREADSHEET_EXTENSIONS = ['xls', 'xlsx']
const PLAIN_TEXT_EXTENSIONS = ['csv', 'txt', 'tsv', 'json']
const ALL_ACCEPTED_EXTENSIONS = [...IMAGE_EXTENSIONS, 'pdf', ...PLAIN_TEXT_EXTENSIONS, ...SPREADSHEET_EXTENSIONS]

export const ATTACHMENT_ACCEPT_ATTRIBUTE = ALL_ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

/** El usuario puede seleccionar/subir el archivo. */
export function isAttachmentMimeTypeAllowed(mediaType: string, filename: string): boolean {
  const ext = extensionOf(filename)
  if (ALL_ACCEPTED_EXTENSIONS.includes(ext)) return true
  // Algunos navegadores mandan mediaType vacío o genérico para csv/xlsx; nos
  // apoyamos igual en el mediaType cuando la extensión no alcanza.
  return (
    mediaType.startsWith('image/') ||
    mediaType === 'application/pdf' ||
    mediaType.startsWith('text/') ||
    mediaType === 'application/json' ||
    mediaType.includes('spreadsheet') ||
    mediaType === 'application/vnd.ms-excel'
  )
}

/** El modelo puede recibirlo directamente como parte multimodal (imagen o PDF). */
export function isImageOrPdfAttachment(mediaType: string, filename: string): boolean {
  const ext = extensionOf(filename)
  return mediaType.startsWith('image/') || mediaType === 'application/pdf' || ext === 'pdf' || IMAGE_EXTENSIONS.includes(ext)
}

/** Se puede leer como texto plano (csv/txt/tsv/json) e inyectarlo en el prompt. */
export function isPlainTextAttachment(mediaType: string, filename: string): boolean {
  const ext = extensionOf(filename)
  return mediaType.startsWith('text/') || mediaType === 'application/json' || PLAIN_TEXT_EXTENSIONS.includes(ext)
}

/** Se puede parsear con la librería xlsx y convertir a CSV para el prompt. */
export function isSpreadsheetAttachment(mediaType: string, filename: string): boolean {
  const ext = extensionOf(filename)
  return mediaType.includes('spreadsheet') || mediaType === 'application/vnd.ms-excel' || SPREADSHEET_EXTENSIONS.includes(ext)
}
