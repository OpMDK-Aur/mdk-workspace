import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const COMPLETED_STATUSES = ['realizada', 'resuelto', 'completada', 'completado', 'done', 'finished', 'cerrada', 'cerrado']

export async function POST(request: Request) {
  try {
    const { taskId, titulo, colaboradorIds, clienteId, clienteName, createdById, createdByName } = await request.json()

    if (!taskId || !titulo || !Array.isArray(colaboradorIds) || colaboradorIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createClient()

    // Check if task is already completed - don't notify for completed tasks
    const { data: tarea } = await supabase
      .from('tareas')
      .select('estado')
      .eq('id', taskId)
      .single()

    if (tarea && COMPLETED_STATUSES.includes(tarea.estado?.toLowerCase())) {
      return NextResponse.json({ success: true, skipped: 'Task already completed' })
    }

    // Build description: "Created by: [name] | Client: [client]"
    const parts = []
    if (createdByName) parts.push(`Creada por: ${createdByName}`)
    if (clienteName) parts.push(`Cliente: ${clienteName}`)
    const descripcion = parts.length > 0 ? parts.join(' | ') : titulo

    const notifications = colaboradorIds.map((colaboradorId: string) => ({
      colaborador_id: colaboradorId,
      tipo: 'comentario',
      titulo: `Nueva tarea: ${titulo}`,
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
      console.error('[v0] Error inserting tarea-asignada notifications:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, created: notifications.length })
  } catch (error) {
    console.error('[v0] tarea-asignada API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
