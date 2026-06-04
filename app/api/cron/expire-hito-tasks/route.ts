import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Cron job to automatically mark overdue hito tasks as 'no_realizado'
 * Runs daily at 00:10 UTC
 * 
 * Logic by hito type:
 * 1. "MENSAJE DE INICIO DE SEMANA" - expires on Mondays, marked as no_realizado after month ends
 * 2. "MENSAJE DE FIN DE SEMANA" - expires on Fridays, marked as no_realizado after month ends
 * 3. All other hitos - expire on last day of month, marked as no_realizado after that day
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() // 0-indexed
    
    // Last day of PREVIOUS month (for weekly tasks that should expire after month ends)
    const lastDayPrevMonth = new Date(currentYear, currentMonth, 0) // Day 0 of current month = last day of prev month
    const lastDayPrevMonthStr = lastDayPrevMonth.toISOString().split('T')[0]
    
    // Today's date string for comparison
    const todayStr = today.toISOString().split('T')[0]

    console.log(`[cron/expire-hito-tasks] Running for date: ${todayStr}, lastDayPrevMonth: ${lastDayPrevMonthStr}`)

    // Fetch all non-terminal hito tasks
    const { data: hitoTasks, error: fetchError } = await supabase
      .from('tareas')
      .select('id, titulo, estado, fecha_vencimiento, hito_poe')
      .not('hito_poe', 'is', null)
      .not('estado', 'in', '("resuelto","no_realizado")')

    if (fetchError) {
      console.error('[cron/expire-hito-tasks] Error fetching tasks:', fetchError)
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      )
    }

    if (!hitoTasks || hitoTasks.length === 0) {
      console.log('[cron/expire-hito-tasks] No pending hito tasks found')
      return NextResponse.json({
        success: true,
        tasksUpdated: 0,
        message: 'No pending hito tasks to process',
      })
    }

    // Fetch hitos_config to get hito names
    const hitoIds = [...new Set(hitoTasks.map(t => t.hito_poe).filter(Boolean))]
    const { data: hitosConfig } = await supabase
      .from('hitos_config')
      .select('id, nombre')
      .in('id', hitoIds)
    
    const hitosMap = new Map((hitosConfig || []).map(h => [h.id, h.nombre]))

    console.log(`[cron/expire-hito-tasks] Found ${hitoTasks.length} pending hito tasks`)

    // Categorize and filter tasks that should be marked as no_realizado
    const tasksToExpire: string[] = []
    
    for (const task of hitoTasks) {
      const hitoNombre = (hitosMap.get(task.hito_poe) || task.titulo || '').toUpperCase()
      const fechaVencimiento = task.fecha_vencimiento ? new Date(task.fecha_vencimiento) : null
      
      if (!fechaVencimiento) continue
      
      const taskMonth = fechaVencimiento.getMonth()
      const taskYear = fechaVencimiento.getFullYear()
      const fechaVencStr = fechaVencimiento.toISOString().split('T')[0]
      
      // Check if task is from a previous month (month already ended)
      const isFromPreviousMonth = (taskYear < currentYear) || 
                                   (taskYear === currentYear && taskMonth < currentMonth)
      
      if (hitoNombre.includes('MENSAJE DE INICIO DE SEMANA') || hitoNombre.includes('INICIO DE SEMANA')) {
        // Weekly Monday tasks - expire after month ends
        if (isFromPreviousMonth) {
          console.log(`[cron/expire-hito-tasks] Expiring INICIO SEMANA task: ${task.id} (${task.titulo})`)
          tasksToExpire.push(task.id)
        }
      } else if (hitoNombre.includes('MENSAJE DE FIN DE SEMANA') || hitoNombre.includes('FIN DE SEMANA')) {
        // Weekly Friday tasks - expire after month ends
        if (isFromPreviousMonth) {
          console.log(`[cron/expire-hito-tasks] Expiring FIN SEMANA task: ${task.id} (${task.titulo})`)
          tasksToExpire.push(task.id)
        }
      } else {
        // All other hitos - expire after their fecha_vencimiento (last day of month)
        if (fechaVencStr < todayStr) {
          console.log(`[cron/expire-hito-tasks] Expiring regular hito task: ${task.id} (${task.titulo}), vencimiento: ${fechaVencStr}`)
          tasksToExpire.push(task.id)
        }
      }
    }

    if (tasksToExpire.length === 0) {
      console.log('[cron/expire-hito-tasks] No tasks need to be expired today')
      return NextResponse.json({
        success: true,
        tasksUpdated: 0,
        message: 'No tasks to expire today',
      })
    }

    console.log(`[cron/expire-hito-tasks] Marking ${tasksToExpire.length} tasks as no_realizado`)

    // Update all expired tasks to 'no_realizado'
    const { error: updateError } = await supabase
      .from('tareas')
      .update({ 
        estado: 'no_realizado',
        updated_at: new Date().toISOString(),
      })
      .in('id', tasksToExpire)

    if (updateError) {
      console.error('[cron/expire-hito-tasks] Error updating tasks:', updateError)
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    // Also update the corresponding mapa_servicio_instancias to 'no_realizado'
    const { error: instanceError } = await supabase
      .from('mapa_servicio_instancias')
      .update({ estado: 'no_realizado' })
      .in('tarea_id', tasksToExpire)

    if (instanceError) {
      console.error('[cron/expire-hito-tasks] Error updating instances:', instanceError)
      // Don't fail the whole operation, just log
    }

    console.log(`[cron/expire-hito-tasks] Successfully marked ${tasksToExpire.length} tasks as no_realizado`)

    return NextResponse.json({
      success: true,
      tasksUpdated: tasksToExpire.length,
      taskIds: tasksToExpire,
    })
  } catch (error) {
    console.error('[cron/expire-hito-tasks] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
