import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Cron job to automatically mark overdue hito tasks as 'no_realizado'
 * Runs daily at 00:10 UTC
 * 
 * Targets tasks that:
 * - Have hito_poe (are hito tasks)
 * - Have fecha_vencimiento < today
 * - Are NOT already in terminal states (resuelto, no_realizado)
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
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    console.log(`[cron/expire-hito-tasks] Running for date: ${todayStr}`)

    // Find all hito tasks that are overdue and not in terminal states
    const { data: overdueTasks, error: fetchError } = await supabase
      .from('tareas')
      .select('id, titulo, estado, fecha_vencimiento, hito_poe')
      .not('hito_poe', 'is', null)
      .lt('fecha_vencimiento', todayStr)
      .not('estado', 'in', '("resuelto","no_realizado")')

    if (fetchError) {
      console.error('[cron/expire-hito-tasks] Error fetching tasks:', fetchError)
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      )
    }

    if (!overdueTasks || overdueTasks.length === 0) {
      console.log('[cron/expire-hito-tasks] No overdue hito tasks found')
      return NextResponse.json({
        success: true,
        tasksUpdated: 0,
        message: 'No overdue hito tasks to process',
      })
    }

    console.log(`[cron/expire-hito-tasks] Found ${overdueTasks.length} overdue hito tasks`)

    // Update all overdue tasks to 'no_realizado'
    const taskIds = overdueTasks.map(t => t.id)
    const { error: updateError } = await supabase
      .from('tareas')
      .update({ 
        estado: 'no_realizado',
        updated_at: new Date().toISOString(),
      })
      .in('id', taskIds)

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
      .in('tarea_id', taskIds)

    if (instanceError) {
      console.error('[cron/expire-hito-tasks] Error updating instances:', instanceError)
      // Don't fail the whole operation, just log
    }

    console.log(`[cron/expire-hito-tasks] Successfully marked ${taskIds.length} tasks as no_realizado`)

    return NextResponse.json({
      success: true,
      tasksUpdated: taskIds.length,
      taskIds,
    })
  } catch (error) {
    console.error('[cron/expire-hito-tasks] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
