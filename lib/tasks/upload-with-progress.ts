import { Upload } from 'tus-js-client'
import { createClient } from '@/lib/supabase/client'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const BUCKET = 'task-files'
// Supabase's resumable endpoint requires exactly 6 MB chunks.
const TUS_CHUNK_SIZE = 6 * 1024 * 1024

export function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function describeTusError(err: unknown, fileName: string) {
  const res = (err as { originalResponse?: { getStatus(): number; getBody(): string } })?.originalResponse
  if (res) {
    let detail = ''
    try {
      const body = JSON.parse(res.getBody() || '{}')
      detail = body.message || body.error || ''
    } catch {
      detail = res.getBody()?.slice(0, 120) ?? ''
    }
    return `Error ${res.getStatus()} al subir ${fileName}${detail ? `: ${detail}` : ''}`
  }
  return `No se pudo subir ${fileName}. Revisá tu conexión e intentá de nuevo.`
}

/**
 * Resumable (TUS) upload straight to Supabase Storage. Files are sent in 6 MB
 * chunks with automatic retries, so large files survive slow or flaky networks
 * where a single long POST would time out.
 */
export async function uploadTaskFile(
  file: File,
  path: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${baseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: TUS_CHUNK_SIZE,
      removeFingerprintOnSuccess: true,
      uploadDataDuringCreation: true,
      headers: {
        authorization: `Bearer ${session?.access_token ?? anonKey}`,
        apikey: anonKey,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onProgress: (sent, total) => {
        if (total > 0) onProgress(Math.round((sent / total) * 100))
      },
      onError: (err) => reject(new Error(describeTusError(err, file.name))),
      onSuccess: () => resolve(),
    })

    signal?.addEventListener('abort', () => {
      upload.abort(true).finally(() => reject(new DOMException('Aborted', 'AbortError')))
    })

    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    })
  })

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
