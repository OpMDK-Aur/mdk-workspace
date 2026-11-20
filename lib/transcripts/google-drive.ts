import 'server-only'
import { cleanTranscriptText, isTranscriptDocName } from './parse'

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'

export type DriveTranscriptFile = { id: string; name: string; createdTime: string; webViewLink: string | null }

export class DriveAuthError extends Error {
  constructor() {
    super('Google Docs pidió volver a conectar la cuenta.')
  }
}

async function driveFetch(url: URL | string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (response.status === 401 || response.status === 403) throw new DriveAuthError()
  return response
}

/** Documentos de Meet/Gemini (transcripciones) creados o modificados desde `since`. */
export async function listTranscriptDocs(accessToken: string, since: Date, maxFiles = 100): Promise<DriveTranscriptFile[]> {
  const q = [
    "mimeType='application/vnd.google-apps.document'",
    'trashed=false',
    `modifiedTime > '${since.toISOString()}'`,
    "(name contains 'Transcript' or name contains 'Transcripción' or name contains 'Transcripcion' or name contains 'Gemini')",
  ].join(' and ')
  const files: DriveTranscriptFile[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 5 && files.length < maxFiles; page += 1) {
    const url = new URL(DRIVE_FILES_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('fields', 'nextPageToken, files(id, name, createdTime, webViewLink)')
    url.searchParams.set('orderBy', 'createdTime desc')
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('includeItemsFromAllDrives', 'true')
    url.searchParams.set('supportsAllDrives', 'true')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await driveFetch(url, accessToken)
    if (!response.ok) throw new Error(`Google Drive respondió ${response.status}`)
    const body = (await response.json()) as { files?: Array<{ id: string; name: string; createdTime: string; webViewLink?: string }>; nextPageToken?: string }
    for (const file of body.files ?? []) {
      if (isTranscriptDocName(file.name)) files.push({ id: file.id, name: file.name, createdTime: file.createdTime, webViewLink: file.webViewLink ?? null })
    }
    pageToken = body.nextPageToken
    if (!pageToken) break
  }
  return files.slice(0, maxFiles)
}

/** Metadatos de un documento puntual (para vincular uno pegando su link). */
export async function getDocMetadata(accessToken: string, docId: string): Promise<DriveTranscriptFile | null> {
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(docId)}`)
  url.searchParams.set('fields', 'id, name, createdTime, webViewLink, mimeType')
  url.searchParams.set('supportsAllDrives', 'true')
  const response = await driveFetch(url, accessToken)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Google Drive respondió ${response.status}`)
  const file = (await response.json()) as { id: string; name: string; createdTime: string; webViewLink?: string; mimeType?: string }
  if (file.mimeType !== 'application/vnd.google-apps.document') return null
  return { id: file.id, name: file.name, createdTime: file.createdTime, webViewLink: file.webViewLink ?? null }
}

/** Texto plano del documento. */
export async function exportDocText(accessToken: string, docId: string) {
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(docId)}/export`)
  url.searchParams.set('mimeType', 'text/plain')
  const response = await driveFetch(url, accessToken)
  if (!response.ok) throw new Error(`No se pudo exportar el documento (${response.status})`)
  return cleanTranscriptText(await response.text())
}
