import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// This endpoint generates notifications for:
// - Tasks due this week
// - Tasks overdue
// Can be called periodically via cron or on dashboard load

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    console.log('[v0] notifications/generate - user:', user?.id, user?.email)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + (7 - now.getDay())) // End of current week (Sunday)
    endOfWeek.setHours(23, 59, 59, 999)

    // Get user's collaborador record using email
    const { data: colaborador } = await supabase
      .from('colaboradores')
      .select('id, email')
      .eq('email', user.email)
      .single()
    
    if (!colaborador) {
      return NextResponse.json({ error: 'Colaborador not found' }, { status: 404 })
    }
    
    const isAdmin = colaborador.email === 'operaciones@madketing.io' || colaborador.email === 'direccion@madketing.io'
    
    // Build query - admins see all tasks, others see only their assigned tasks
    let query = supabase
      .from('tareas')
      .select(`
        id,
        titulo,
        fecha_vencimiento,
        estado,
        cliente_id,
        asignado_a
      `)
      .neq('estado', 'completada')
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', endOfWeek.toISOString())
      .order('fecha_vencimiento', { ascending: true })
    
    // If not admin, filter by assigned tasks only
    if (!isAdmin) {
      query = query.eq('asignado_a', colaborador.id)
    }
    
    const { data: tareas, error: tareasError } = await query

    console.log('[v0] notifications/generate - tareas found:', tareas?.length, 'error:', tareasError)
    if (tareasError) {
      console.error('Error fetching tasks:', tareasError)
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

      // Check if notification already exists for this task (to avoid duplicates)
      const { data: existingNotif } = await supabase
        .from('notificaciones')
        .select('id')
        .eq('colaborador_id', colaborador.id)
        .eq('referencia_id', tarea.id)
        .eq('tipo', 'tarea_vence')
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())
        .limit(1)

      if (!existingNotif || existingNotif.length === 0) {
        notificationsToCreate.push({
          colaborador_id: colaborador.id,
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

    // Insert new notifications
    if (notificationsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('notificaciones')
        .insert(notificationsToCreate)

      if (insertError) {
        console.error('Error inserting notifications:', insertError)
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

// Also support GET for easy testing/cron calls
export async function GET() {
  return POST()
}
