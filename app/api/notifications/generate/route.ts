import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// This endpoint generates notifications for tasks due/overdue
// Only creates notifications for the ASSIGNED user of each task

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's colaborador record
    const { data: currentColaborador } = await supabase
      .from('colaboradores')
      .select('id, email')
      .eq('email', user.email)
      .single()
    
    if (!currentColaborador) {
      return NextResponse.json({ error: 'Colaborador not found' }, { status: 404 })
    }

    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()))
    endOfWeek.setHours(23, 59, 59, 999)

    // Get tasks assigned to the CURRENT USER that are due or overdue
    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select(`
        id,
        titulo,
        fecha_vencimiento,
        estado,
        cliente_id,
        asignado_a
      `)
      .eq('asignado_a', currentColaborador.id)
      .neq('estado', 'completada')
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', endOfWeek.toISOString())
      .order('fecha_vencimiento', { ascending: true })

    if (tareasError) {
      return NextResponse.json({ error: tareasError.message }, { status: 500 })
    }

    const notificationsToCreate: {
      colaborador_id: string
      tipo: string
      titulo: string
      descripcion: string
      referencia_id: string
      referencia_tipo: string
      cliente_id: string | null
    }[] = []

    for (const tarea of tareas || []) {
      const fechaVencimiento = new Date(tarea.fecha_vencimiento)
      const isOverdue = fechaVencimiento < now

      // Check if notification already exists for this task today
      const { data: existingNotif } = await supabase
        .from('notificaciones')
        .select('id')
        .eq('colaborador_id', currentColaborador.id)
        .eq('referencia_id', tarea.id)
        .eq('tipo', 'tarea_vence')
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())
        .limit(1)

      if (!existingNotif || existingNotif.length === 0) {
        notificationsToCreate.push({
          colaborador_id: currentColaborador.id,
          tipo: 'tarea_vence',
          titulo: isOverdue 
            ? `Tarea vencida: ${tarea.titulo}`
            : `Tarea vence pronto: ${tarea.titulo}`,
          descripcion: isOverdue
            ? `Esta tarea venció el ${fechaVencimiento.toLocaleDateString('es-AR')}`
            : `Vence el ${fechaVencimiento.toLocaleDateString('es-AR')}`,
          referencia_id: tarea.id,
          referencia_tipo: 'tarea',
          cliente_id: tarea.cliente_id,
        })
      }
    }

    if (notificationsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('notificaciones')
        .insert(notificationsToCreate)

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      success: true, 
      created: notificationsToCreate.length,
      tasksChecked: tareas?.length || 0
    })

  } catch (error) {
    console.error('Error generating notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return POST()
}

// DELETE: Clean up old tarea_vence notifications that don't match assigned user
export async function DELETE() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete tarea_vence notifications where the task's asignado_a doesn't match the notification's colaborador_id
    // First get all tarea_vence notifications
    const { data: notifications } = await supabase
      .from('notificaciones')
      .select('id, colaborador_id, referencia_id')
      .eq('tipo', 'tarea_vence')

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    // Get all referenced tasks
    const taskIds = [...new Set(notifications.map(n => n.referencia_id).filter(Boolean))]
    const { data: tasks } = await supabase
      .from('tareas')
      .select('id, asignado_a')
      .in('id', taskIds)

    const taskAssigneeMap = new Map(tasks?.map(t => [t.id, t.asignado_a]) || [])

    // Find notifications to delete (where colaborador_id doesn't match task's asignado_a)
    const toDelete = notifications.filter(n => {
      const assignedTo = taskAssigneeMap.get(n.referencia_id)
      return assignedTo && assignedTo !== n.colaborador_id
    })

    if (toDelete.length > 0) {
      await supabase
        .from('notificaciones')
        .delete()
        .in('id', toDelete.map(n => n.id))
    }

    return NextResponse.json({ deleted: toDelete.length })
  } catch (error) {
    console.error('Error cleaning notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
