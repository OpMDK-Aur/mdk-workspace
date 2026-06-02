import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// This endpoint generates notifications for overdue tasks only
// Only creates notifications for the ASSIGNED user of each task
// Excludes tasks in "realizada" status

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentColaborador } = await supabase
      .from('colaboradores')
      .select('id, email')
      .eq('email', user.email)
      .single()
    
    if (!currentColaborador) {
      return NextResponse.json({ error: 'Colaborador not found' }, { status: 404 })
    }

    const now = new Date()

    // Step 1: Delete tarea_vence notifications for tasks that are now resolved or no longer overdue
    // Get all existing tarea_vence notifications for this user
    const { data: existingVenceNotifs } = await supabase
      .from('notificaciones')
      .select('id, referencia_id')
      .eq('colaborador_id', currentColaborador.id)
      .eq('tipo', 'tarea_vence')

    if (existingVenceNotifs && existingVenceNotifs.length > 0) {
      const referencedTaskIds = existingVenceNotifs.map(n => n.referencia_id).filter(Boolean)

      // Find which of those tasks are now resolved/completed (any completed status)
      const { data: resolvedTasks } = await supabase
        .from('tareas')
        .select('id, estado, fecha_vencimiento')
        .in('id', referencedTaskIds)

      if (resolvedTasks && resolvedTasks.length > 0) {
        // Task is resolved if estado is any of: realizada, resuelto, completada, completado, done, finished
        // OR if fecha_vencimiento is now in the future (no longer overdue)
        const completedStatuses = ['realizada', 'resuelto', 'completada', 'completado', 'done', 'finished', 'cerrada', 'cerrado']
        const resolvedIds = new Set(
          resolvedTasks
            .filter(t => 
              completedStatuses.includes(t.estado?.toLowerCase()) || 
              (t.fecha_vencimiento && new Date(t.fecha_vencimiento) >= now)
            )
            .map(t => t.id)
        )
        const notifsToDelete = existingVenceNotifs
          .filter(n => resolvedIds.has(n.referencia_id))
          .map(n => n.id)

        if (notifsToDelete.length > 0) {
          await supabase
            .from('notificaciones')
            .delete()
            .in('id', notifsToDelete)
        }
      }
    }

    // Step 2: Get tasks that are OVERDUE and NOT resolved to create new notifications
    // Exclude all completed status variants
    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select('id, titulo, fecha_vencimiento, estado, cliente_id, asignado_a')
      .eq('asignado_a', currentColaborador.id)
      .not('estado', 'in', '(realizada,resuelto,completada,completado,done,finished,cerrada,cerrado)')
      .not('fecha_vencimiento', 'is', null)
      .lt('fecha_vencimiento', now.toISOString())
      .order('fecha_vencimiento', { ascending: true })

    if (tareasError) {
      return NextResponse.json({ error: tareasError.message }, { status: 500 })
    }

    // Step 3: Avoid duplicates - check which ones already have a notification
    const taskIds = (tareas || []).map(t => t.id)
    
    const { data: stillExistingNotifs } = taskIds.length > 0 
      ? await supabase
          .from('notificaciones')
          .select('referencia_id')
          .eq('colaborador_id', currentColaborador.id)
          .eq('tipo', 'tarea_vence')
          .in('referencia_id', taskIds)
      : { data: [] }
    
    const existingTaskIds = new Set(stillExistingNotifs?.map(n => n.referencia_id) || [])

    const notificationsToCreate = (tareas || [])
      .filter(tarea => !existingTaskIds.has(tarea.id))
      .map(tarea => ({
        colaborador_id: currentColaborador.id,
        tipo: 'tarea_vence',
        titulo: `Tarea vencida: ${tarea.titulo}`,
        descripcion: `Esta tarea venció el ${new Date(tarea.fecha_vencimiento).toLocaleDateString('es-AR')}`,
        referencia_id: tarea.id,
        referencia_tipo: 'tarea',
        cliente_id: tarea.cliente_id,
      }))

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

// DELETE: Clear ALL notifications and regenerate only overdue tasks
export async function DELETE() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete ALL notifications
    const { error: deleteError, count } = await supabase
      .from('notificaciones')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (workaround for delete all)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: count || 'all' })
  } catch (error) {
    console.error('Error cleaning notifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
