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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

    // Step 1: Delete notifications for tasks that are now resolved or no longer in the time range
    const { data: existingNotifs } = await supabase
      .from('notificaciones')
      .select('id, referencia_id, tipo')
      .eq('colaborador_id', currentColaborador.id)
      .in('tipo', ['tarea_vence', 'tarea_hoy'])

    if (existingNotifs && existingNotifs.length > 0) {
      const referencedTaskIds = existingNotifs.map(n => n.referencia_id).filter(Boolean)

      const { data: resolvedTasks } = await supabase
        .from('tareas')
        .select('id, estado, fecha_vencimiento')
        .in('id', referencedTaskIds)

      if (resolvedTasks && resolvedTasks.length > 0) {
        const completedStatuses = ['realizada', 'resuelto', 'completada', 'completado', 'done', 'finished', 'cerrada', 'cerrado']
        
        // Determine which notifications to delete
        const notifsToDelete = existingNotifs.filter(notif => {
          const task = resolvedTasks.find(t => t.id === notif.referencia_id)
          if (!task) return true // Delete if task no longer exists
          
          // Delete if task is completed
          if (completedStatuses.includes(task.estado?.toLowerCase())) {
            return true
          }
          
          // Delete if tarea_vence but date is now >= tomorrow (no longer overdue/today)
          if (notif.tipo === 'tarea_vence') {
            const taskDate = new Date(task.fecha_vencimiento)
            const taskDateAtMidnight = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate())
            if (taskDateAtMidnight >= tomorrow) {
              return true
            }
          }
          
          // Delete if tarea_hoy but date is now < today or > today (no longer today)
          if (notif.tipo === 'tarea_hoy') {
            const taskDate = new Date(task.fecha_vencimiento)
            const taskDateAtMidnight = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate())
            if (taskDateAtMidnight < today || taskDateAtMidnight >= tomorrow) {
              return true
            }
          }
          
          return false
        }).map(n => n.id)

        if (notifsToDelete.length > 0) {
          await supabase
            .from('notificaciones')
            .delete()
            .in('id', notifsToDelete)
        }
      }
    }

    // Step 2: Get tasks that are OVERDUE (vencidas - fecha < hoy)
    const { data: tareasVencidas } = await supabase
      .from('tareas')
      .select('id, titulo, fecha_vencimiento, estado, cliente_id, asignado_a')
      .eq('asignado_a', currentColaborador.id)
      .not('estado', 'in', '(realizada,resuelto,completada,completado,done,finished,cerrada,cerrado)')
      .not('fecha_vencimiento', 'is', null)
      .lt('fecha_vencimiento', today.toISOString())
      .order('fecha_vencimiento', { ascending: true })

    // Step 3: Get tasks that are TODAY (fecha = hoy)
    const { data: tareaasHoy } = await supabase
      .from('tareas')
      .select('id, titulo, fecha_vencimiento, estado, cliente_id, asignado_a')
      .eq('asignado_a', currentColaborador.id)
      .not('estado', 'in', '(realizada,resuelto,completada,completado,done,finished,cerrada,cerrado)')
      .not('fecha_vencimiento', 'is', null)
      .gte('fecha_vencimiento', today.toISOString())
      .lt('fecha_vencimiento', tomorrow.toISOString())
      .order('fecha_vencimiento', { ascending: true })

    // Step 4: Avoid duplicates - check which ones already have notifications
    const allTaskIds = [
      ...(tareasVencidas || []).map(t => t.id),
      ...(tareaasHoy || []).map(t => t.id),
    ]
    
    const { data: stillExistingNotifs } = allTaskIds.length > 0 
      ? await supabase
          .from('notificaciones')
          .select('referencia_id, tipo')
          .eq('colaborador_id', currentColaborador.id)
          .in('referencia_tipo', ['tarea_vence', 'tarea_hoy'])
          .in('referencia_id', allTaskIds)
      : { data: [] }
    
    const existingTasksByType = new Map<string, Set<string>>()
    stillExistingNotifs?.forEach(n => {
      if (!existingTasksByType.has(n.tipo)) {
        existingTasksByType.set(n.tipo, new Set())
      }
      existingTasksByType.get(n.tipo)!.add(n.referencia_id)
    })

    const notificationsToCreate = []

    // Create notifications for overdue tasks
    const vencidaIds = existingTasksByType.get('tarea_vence') || new Set()
    notificationsToCreate.push(
      ...(tareasVencidas || [])
        .filter(tarea => !vencidaIds.has(tarea.id))
        .map(tarea => ({
          colaborador_id: currentColaborador.id,
          tipo: 'tarea_vence',
          titulo: `Tarea vencida: ${tarea.titulo}`,
          descripcion: `Esta tarea venció el ${new Date(tarea.fecha_vencimiento).toLocaleDateString('es-AR')}`,
          referencia_id: tarea.id,
          referencia_tipo: 'tarea',
          cliente_id: tarea.cliente_id,
        }))
    )

    // Create notifications for today's tasks
    const hoyIds = existingTasksByType.get('tarea_hoy') || new Set()
    notificationsToCreate.push(
      ...(tareaasHoy || [])
        .filter(tarea => !hoyIds.has(tarea.id))
        .map(tarea => ({
          colaborador_id: currentColaborador.id,
          tipo: 'tarea_hoy',
          titulo: `Tarea de hoy: ${tarea.titulo}`,
          descripcion: `Esta tarea vence hoy`,
          referencia_id: tarea.id,
          referencia_tipo: 'tarea',
          cliente_id: tarea.cliente_id,
        }))
    )

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
      tasksChecked: (tareasVencidas?.length || 0) + (tareaasHoy?.length || 0)
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
