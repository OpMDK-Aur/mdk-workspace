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

    // Get tasks assigned to the CURRENT USER that are OVERDUE (past due date)
    // Exclude "realizada" status
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
      .not('estado', 'eq', 'realizada')
      .not('fecha_vencimiento', 'is', null)
      .lt('fecha_vencimiento', now.toISOString())
      .order('fecha_vencimiento', { ascending: true })

    if (tareasError) {
      return NextResponse.json({ error: tareasError.message }, { status: 500 })
    }

    // Get existing notifications to avoid duplicates
    const taskIds = (tareas || []).map(t => t.id)
    
    const { data: existingNotifs } = taskIds.length > 0 
      ? await supabase
          .from('notificaciones')
          .select('referencia_id')
          .eq('colaborador_id', currentColaborador.id)
          .eq('tipo', 'tarea_vence')
          .in('referencia_id', taskIds)
      : { data: [] }
    
    const existingTaskIds = new Set(existingNotifs?.map(n => n.referencia_id) || [])

    const notificationsToCreate = (tareas || [])
      .filter(tarea => !existingTaskIds.has(tarea.id))
      .map(tarea => {
        const fechaVencimiento = new Date(tarea.fecha_vencimiento)
        return {
          colaborador_id: currentColaborador.id,
          tipo: 'tarea_vence',
          titulo: `Tarea vencida: ${tarea.titulo}`,
          descripcion: `Esta tarea venció el ${fechaVencimiento.toLocaleDateString('es-AR')}`,
          referencia_id: tarea.id,
          referencia_tipo: 'tarea',
          cliente_id: tarea.cliente_id,
        }
      })

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
