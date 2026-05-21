import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { taskId, titulo, colaboradorIds, clienteId } = await request.json()

    if (!taskId || !titulo || !Array.isArray(colaboradorIds) || colaboradorIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()

    const notifications = colaboradorIds.map((colaboradorId: string) => ({
      colaborador_id: colaboradorId,
      tipo: 'comentario',
      titulo: 'Nueva tarea asignada',
      descripcion: titulo,
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
