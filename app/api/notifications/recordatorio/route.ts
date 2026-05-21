import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { taskId, tituloTarea, fecha, hora, colaboradorIds } = await request.json()

    if (!taskId || !tituloTarea) {
      return NextResponse.json({ error: 'Missing taskId or tituloTarea' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ error: 'No authenticated user' }, { status: 401 })
    }

    // Create reminder for each assignee
    const destinatarios = colaboradorIds && Array.isArray(colaboradorIds) ? colaboradorIds : []

    if (destinatarios.length === 0) {
      return NextResponse.json({ success: true }) // No reminders if no recipients
    }

    const fechaTexto = fecha && hora
      ? `${new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} a las ${hora}`
      : fecha
        ? new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
        : null

    const notificaciones = destinatarios.map(colaboradorId => ({
      colaborador_id: colaboradorId,
      tipo: 'tarea_vence',
      titulo: tituloTarea.trim(),
      descripcion: fechaTexto ? `Recordatorio para el ${fechaTexto}` : 'Recordatorio',
      referencia_id: taskId,
      referencia_tipo: 'tarea',
      leida: false,
    }))

    const { error } = await supabase
      .from('notificaciones')
      .insert(notificaciones)

    if (error) {
      console.error('[v0] Error creating reminders:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
