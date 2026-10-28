import { NextResponse } from 'next/server'
import { getGoogleSheetsAccess } from '@/lib/google/sheets-token'

export const runtime = 'nodejs'
export const maxDuration = 60

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^[\w-]{10,}$/.test(id)) return NextResponse.json({ error: 'ID de archivo inválido' }, { status: 400 })

  const access = await getGoogleSheetsAccess()
  if ('error' in access) return NextResponse.json({ error: 'Conectá tu cuenta de Google.', code: 'google_not_connected' }, { status: 401 })

  const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${access.accessToken}` },
    cache: 'no-store',
  })
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: upstream.status === 404 || upstream.status === 403 ? 'Sin acceso al archivo de Drive' : 'No se pudo descargar el archivo' }, { status: upstream.status === 404 || upstream.status === 403 ? upstream.status : 502 })
  }

  const contentType = upstream.headers.get('content-type')?.split(';')[0] ?? ''
  if (!ACCEPTED_MIME.includes(contentType)) return NextResponse.json({ error: 'Formato no compatible' }, { status: 415 })

  const headers = new Headers({ 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)
  return new Response(upstream.body, { headers })
}
