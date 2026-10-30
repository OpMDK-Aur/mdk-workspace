import 'server-only'
import { NextResponse } from 'next/server'
import { getGoogleSheetsAccess } from '@/lib/google/sheets-token'
import { GoogleApiError } from '@/lib/google/sheet-import'
import { resolveBulkClient } from '@/lib/meta-ads/bulk-access'
import { createClient } from '@/lib/supabase/server'
import { BulkAiError } from './ai'
import { MetaReadError } from './inventory'

export async function requireBulkAccess(clientId: unknown) {
  const id = typeof clientId === 'string' ? clientId : ''
  const access = await resolveBulkClient(id)
  if ('error' in access) return { error: access.error as NextResponse }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  return { ...access, clientId: id, userId: user.id }
}

const GOOGLE_ERRORS = {
  unauthenticated: 'Iniciá sesión para leer el sheet.',
  not_connected: 'Conectá tu cuenta de Google para leer sheets y Drive.',
  expired: 'La conexión con Google venció. Volvé a conectarla.',
} as const

export async function requireGoogle() {
  const access = await getGoogleSheetsAccess()
  if ('error' in access) return { error: NextResponse.json({ error: GOOGLE_ERRORS[access.error], code: access.error === 'unauthenticated' ? 'unauthenticated' : 'google_not_connected' }, { status: 401 }) }
  return access
}

export function bulkErrorResponse(error: unknown, email?: string | null) {
  if (error instanceof GoogleApiError) {
    if (error.status === 403 || error.status === 404) return NextResponse.json({ error: `No tengo acceso a ese sheet. Compartilo${email ? ` con ${email}` : ''} o revisá el link.` }, { status: 403 })
    if (error.status === 401) return NextResponse.json({ error: GOOGLE_ERRORS.expired, code: 'google_not_connected' }, { status: 401 })
    return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 500 ? error.status : 502 })
  }
  if (error instanceof BulkAiError || error instanceof MetaReadError) return NextResponse.json({ error: error.message }, { status: 502 })
  console.error('[bulk-plan] unexpected error', error)
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, { status: 500 })
}

export const clampText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
