import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Event types that trigger notifications
export type TaskEventType = 'tarea_resuelta' | 'asignado_a_tarea' | 'fecha_cambiada' | 'cliente_agregado'

export async function POST(request: Request) {
  try {
    const {
      eventType,
      taskId,
      taskTitle,
      // Who triggered the event
      actorName,
      // Recipients (colaborador ids to notify)
      colaboradorIds,
      // Extra context per event
      newDate,
      clienteName,
      clienteId,
    }: {
      eventType: TaskEventType
      taskId: string
      taskTitle: string
      actorName: string
      colaboradorIds: string[]
      newDate?: string
      clienteName?: string
      clienteId?: string
    } = await request.json()

    if (!eventType || !taskId || !taskTitle || !Array.isArray(colaboradorIds) || colaboradorIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    let titulo = ''
    let descripcion = ''

    switch (eventType) {
      case 'tarea_resuelta':
        titulo = `Tarea resuelta: ${taskTitle}`
        descripcion = `Marcada como resuelta por ${actorName}`
        break
      case 'asignado_a_tarea':
        titulo = `Te agregaron a una tarea: ${taskTitle}`
        descripcion = `Asignado por ${actorName}`
        break
      case 'fecha_cambiada':
        titulo = `Fecha de fin cambiada: ${taskTitle}`
        descripcion = newDate
          ? `Nueva fecha: ${new Date(newDate).toLocaleDateString('es-AR')} · Por ${actorName}`
          : `Modificada por ${actorName}`
        break
      case 'cliente_agregado':
        titulo = `Nuevo cliente en tarea: ${taskTitle}`
        descripcion = clienteName
          ? `${clienteName} · Agregado por ${actorName}`
          : `Agregado por ${actorName}`
        break
    }

    const notifications = colaboradorIds.map((colaboradorId: string) => ({
      colaborador_id: colaboradorId,
      tipo: eventType,
      titulo,
      descripcion,
      referencia_id: taskId,
      referencia_tipo: 'tarea',
      cliente_id: clienteId || null,
      leida: false,
    }))

    const { error } = await supabase
      .from('notificaciones')
      .insert(notifications)

    if (error) {
      console.error('[v0] Error inserting task-event notifications:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, created: notifications.length })
  } catch (error) {
    console.error('[v0] task-event API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
