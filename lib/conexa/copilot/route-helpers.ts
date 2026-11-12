import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export class CopilotError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: collaborator } = await supabase.from('colaboradores').select('id, activo').eq('id', user.id).maybeSingle()
  if (!collaborator || collaborator.activo !== true) return { error: NextResponse.json({ error: 'Solo usuarios activos de MDK pueden usar Recomendaciones.' }, { status: 403 }) }
  const meta = user.user_metadata ?? {}
  const name = String(meta.full_name || meta.name || user.email?.split('@')[0] || 'Usuario')
  return { user, name, supabase }
}

export function copilotError(cause: unknown) {
  if (cause instanceof CopilotError) return NextResponse.json({ error: cause.message }, { status: cause.status })
  console.error('[conexa:recomendaciones]', cause instanceof Error ? cause.message : 'Error inesperado')
  return NextResponse.json({ error: 'No se pudo completar la acción.' }, { status: 500 })
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
