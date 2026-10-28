import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CopilotError } from './store'

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const meta = user.user_metadata ?? {}
  const name = String(meta.full_name || meta.name || user.email?.split('@')[0] || 'Usuario')
  return { user, name }
}

export function copilotError(cause: unknown) {
  if (cause instanceof CopilotError) return NextResponse.json({ error: cause.message }, { status: cause.status })
  console.error('[conexa:copilot]', cause)
  return NextResponse.json({ error: 'No se pudo completar la acción' }, { status: 500 })
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

export type IdParams = { params: Promise<{ id: string }> }
