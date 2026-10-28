import { NextResponse } from 'next/server'
import { getGoogleSheetsAccess } from '@/lib/google/sheets-token'
import { GoogleApiError, readSheetGrid, resolveDriveLinks } from '@/lib/google/sheet-import'

export const runtime = 'nodejs'
export const maxDuration = 60

const ACCESS_ERRORS = {
  unauthenticated: { status: 401, message: 'Iniciá sesión para leer el sheet.' },
  not_connected: { status: 401, message: 'Conectá tu cuenta de Google para leer sheets y Drive.' },
  expired: { status: 401, message: 'La conexión con Google venció. Volvé a conectarla.' },
} as const

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const url = typeof body?.url === 'string' ? body.url.trim().slice(0, 500) : ''
  const driveIds: string[] = Array.isArray(body?.driveIds) ? [...new Set<string>(body.driveIds.filter((id: unknown): id is string => typeof id === 'string' && /^[\w-]{10,100}$/.test(id)))].slice(0, 100) : []
  if (!url && !driveIds.length) return NextResponse.json({ error: 'Pegá el link del Google Sheet.' }, { status: 400 })

  const access = await getGoogleSheetsAccess()
  if ('error' in access) {
    const { status, message } = ACCESS_ERRORS[access.error]
    return NextResponse.json({ error: message, code: access.error === 'unauthenticated' ? 'unauthenticated' : 'google_not_connected' }, { status })
  }

  try {
    return NextResponse.json(driveIds.length ? { links: await resolveDriveLinks(access.accessToken, driveIds) } : await readSheetGrid(access.accessToken, url))
  } catch (error) {
    if (error instanceof GoogleApiError) {
      if (error.status === 403 || error.status === 404) {
        const who = access.email ? ` con ${access.email}` : ''
        return NextResponse.json({ error: `No tengo acceso a ese sheet. Compartilo${who} o revisá el link.` }, { status: 403 })
      }
      if (error.status === 401) return NextResponse.json({ error: ACCESS_ERRORS.expired.message, code: 'google_not_connected' }, { status: 401 })
      return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 500 ? error.status : 502 })
    }
    console.error('[bulk-sheet] read failed', error)
    return NextResponse.json({ error: 'No se pudo leer el sheet.' }, { status: 500 })
  }
}
