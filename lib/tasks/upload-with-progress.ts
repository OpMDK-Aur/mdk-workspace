import { createClient } from '@/lib/supabase/client'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const BUCKET = 'task-files'

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

/**
 * Uploads straight to Supabase Storage with XHR so we get real upload progress
 * (supabase-js `upload` has no progress callback) and skip the serverless body limit.
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
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`)
    xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token ?? anonKey}`)
    xhr.setRequestHeader('apikey', anonKey)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Error ${xhr.status} al subir ${file.name}`))
    }
    xhr.onerror = () => reject(new Error(`No se pudo subir ${file.name}`))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
