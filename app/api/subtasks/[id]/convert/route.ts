import { NextResponse } from 'next/server'
import { isUuid, requireUser } from '@/lib/tasks/subtasks-api'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Subtarea inválida' }, { status: 400 })
  const { supabase, user, error: authError } = await requireUser()
  if (authError) return authError

  const { data: sub, error: subError } = await supabase
    .from('subtareas_tareas')
    .select('titulo, asignado_a, fecha_vencimiento, tareas(tipo_tarea_id, cliente_id, cliente_ids, servicio_id, prioridad)')
    .eq('id', id)
    .single()
  if (subError || !sub) return NextResponse.json({ error: 'Subtarea no encontrada' }, { status: 404 })

  const parent = (Array.isArray(sub.tareas) ? sub.tareas[0] : sub.tareas) as
    | { tipo_tarea_id: string | null; cliente_id: string | null; cliente_ids: string[] | null; servicio_id: string | null; prioridad: string | null }
    | null

  const { data: task, error } = await supabase
    .from('tareas')
    .insert({
      titulo: sub.titulo,
      asignado_a: sub.asignado_a,
      asignados_a: sub.asignado_a ? [sub.asignado_a] : [],
      fecha_vencimiento: sub.fecha_vencimiento,
      tipo_tarea_id: parent?.tipo_tarea_id ?? null,
      cliente_id: parent?.cliente_id ?? null,
      cliente_ids: parent?.cliente_ids ?? null,
      servicio_id: parent?.servicio_id ?? null,
      prioridad: parent?.prioridad ?? 'media',
      creado_por: user!.id,
      estado: 'pendiente',
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('subtareas_tareas').delete().eq('id', id)
  return NextResponse.json({ taskId: task.id }, { status: 201 })
}
