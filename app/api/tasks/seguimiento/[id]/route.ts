import { NextResponse, type NextRequest } from 'next/server'
import { isUuid, requireUser, sanitizeItemFields } from '@/lib/tasks/seguimiento-auth'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const fields = body ? sanitizeItemFields(body) : null
  if (!fields || Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  // A new client invalidates the previous match unless a task is being set in the same request.
  if ('cliente_id' in fields && !('tarea_id' in fields)) {
    const { data: current } = await auth.db.from('seguimiento_items').select('tarea_id, grupo').eq('id', id).single()
    if (current && !current.tarea_id && current.grupo !== 'tarjetas') fields.match_estado = 'pendiente'
  }

  const { data, error } = await auth.db.from('seguimiento_items').update(fields).eq('id', id).select('*').single()
  if (error) {
    console.error('[seguimiento PATCH]', error)
    return NextResponse.json({ error: 'No se pudo actualizar el ítem' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const { error } = await auth.db.from('seguimiento_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'No se pudo borrar el ítem' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
