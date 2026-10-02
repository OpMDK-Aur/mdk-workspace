import { NextResponse, type NextRequest } from 'next/server'
import { isDate, isUuid, requireUser } from '@/lib/tasks/seguimiento-auth'

const OPEN_ESTADOS = ['pendiente', 'resolviendo']

interface TareaRow {
  id: string
  titulo: string
  prioridad: string | null
  fecha_vencimiento: string | null
  cliente_id: string | null
  cliente_ids: string[] | null
}

/** Imports the person's open tasks into the selected week as linked seguimiento items, skipping tasks already there. */
export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const usuarioId = request.nextUrl.searchParams.get('usuario_id')
  const semana = request.nextUrl.searchParams.get('semana')
  if (!isUuid(usuarioId) || !isDate(semana)) {
    return NextResponse.json({ error: 'usuario_id y semana son obligatorios' }, { status: 400 })
  }

  const [tareasRes, existingRes] = await Promise.all([
    auth.db
      .from('tareas')
      .select('id, titulo, prioridad, fecha_vencimiento, cliente_id, cliente_ids')
      .in('estado', OPEN_ESTADOS)
      .or(`asignado_a.eq.${usuarioId},asignados_a.cs.{${usuarioId}}`)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(500),
    auth.db.from('seguimiento_items').select('tarea_id').eq('usuario_id', usuarioId).eq('semana', semana),
  ])

  if (tareasRes.error || existingRes.error) {
    console.error('[seguimiento/sync]', tareasRes.error ?? existingRes.error)
    return NextResponse.json({ error: 'No se pudieron leer las tareas' }, { status: 500 })
  }

  const already = new Set((existingRes.data ?? []).map((r) => r.tarea_id).filter(Boolean))
  const tareas = ((tareasRes.data ?? []) as TareaRow[]).filter((t) => !already.has(t.id))
  if (tareas.length === 0) return NextResponse.json({ created: 0 })

  const clienteIds = [...new Set(tareas.map((t) => t.cliente_id ?? t.cliente_ids?.[0]).filter(Boolean))] as string[]
  const nombres = new Map<string, string>()
  if (clienteIds.length > 0) {
    const { data } = await auth.db.from('clientes').select('id, nombre_del_negocio').in('id', clienteIds)
    for (const c of data ?? []) nombres.set(c.id, c.nombre_del_negocio)
  }

  const weekEnd = new Date(`${semana}T12:00:00`)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndISO = weekEnd.toISOString().slice(0, 10)

  const rows = tareas.map((t) => {
    const clienteId = t.cliente_id ?? t.cliente_ids?.[0] ?? null
    const due = t.fecha_vencimiento ? t.fecha_vencimiento.slice(0, 10) : null
    const prioridad = t.prioridad === 'alta' || t.prioridad === 'baja' ? t.prioridad : 'media'
    const urgente = prioridad === 'alta' || (due !== null && due < semana)
    return {
      usuario_id: usuarioId,
      semana,
      grupo: urgente ? 'urgente' : due && due <= weekEndISO ? 'semana' : 'recurrente',
      titulo: t.titulo.slice(0, 500),
      cliente_id: clienteId,
      cliente_nombre: clienteId ? nombres.get(clienteId) ?? null : null,
      prioridad,
      fecha_vencimiento: due,
      tarea_id: t.id,
      match_estado: 'vinculada',
      completado: false,
    }
  })

  const { error } = await auth.db.from('seguimiento_items').insert(rows)
  if (error) {
    console.error('[seguimiento/sync insert]', error)
    return NextResponse.json({ error: 'No se pudieron importar las tareas' }, { status: 500 })
  }
  return NextResponse.json({ created: rows.length })
}
