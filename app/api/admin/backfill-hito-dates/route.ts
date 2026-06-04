import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Backfill fecha_vencimiento for all hito tasks based on their type
// - MENSAJE DE INICIO DE SEMANA: deadline is the Monday of that week
// - MENSAJE DE FIN DE SEMANA: deadline is the Friday of that week
// - Other hitos: deadline is the last day of the month

function getLastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0)
}

function getMondaysInMonth(year: number, month: number): Date[] {
  const mondays: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) {
    if (date.getDay() === 1) { // Monday
      mondays.push(new Date(date))
    }
    date.setDate(date.getDate() + 1)
  }
  return mondays
}

function getFridaysInMonth(year: number, month: number): Date[] {
  const fridays: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) {
    if (date.getDay() === 5) { // Friday
      fridays.push(new Date(date))
    }
    date.setDate(date.getDate() + 1)
  }
  return fridays
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch all hito tasks (with hito_poe) that don't have fecha_vencimiento OR we want to recalculate
    const { data: hitoTasks, error: fetchError } = await supabase
      .from('tareas')
      .select('id, titulo, hito_poe, created_at, fecha_vencimiento')
      .not('hito_poe', 'is', null)

    if (fetchError) {
      console.error('[backfill-hito-dates] Error fetching tasks:', fetchError)
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    if (!hitoTasks || hitoTasks.length === 0) {
      return NextResponse.json({ success: true, message: 'No hito tasks found', updated: 0 })
    }

    // Fetch hitos_config to get hito names
    const hitoIds = [...new Set(hitoTasks.map(t => t.hito_poe).filter(Boolean))]
    const { data: hitosConfig } = await supabase
      .from('hitos_config')
      .select('id, nombre')
      .in('id', hitoIds)

    const hitosMap = new Map((hitosConfig || []).map(h => [h.id, h.nombre]))

    console.log(`[backfill-hito-dates] Processing ${hitoTasks.length} hito tasks`)

    const updates: { id: string; fecha_vencimiento: string; tipo: string }[] = []

    for (const task of hitoTasks) {
      const hitoNombre = (hitosMap.get(task.hito_poe) || task.titulo || '').toUpperCase()
      
      // Determine the month/year from created_at
      const createdAt = task.created_at ? new Date(task.created_at) : new Date()
      const year = createdAt.getFullYear()
      const month = createdAt.getMonth()

      let fechaVencimiento: Date | null = null
      let tipo = 'regular'

      if (hitoNombre.includes('INICIO DE SEMANA') || hitoNombre.includes('INICIO SEMANA')) {
        // Monday tasks - find which Monday this task corresponds to
        tipo = 'inicio_semana'
        const mondays = getMondaysInMonth(year, month)
        
        // Find the Monday closest to or after the creation date
        for (const monday of mondays) {
          if (monday >= createdAt || monday.toDateString() === createdAt.toDateString()) {
            fechaVencimiento = monday
            break
          }
        }
        // If no Monday found after creation, use the last Monday of the month
        if (!fechaVencimiento && mondays.length > 0) {
          fechaVencimiento = mondays[mondays.length - 1]
        }
        
      } else if (hitoNombre.includes('FIN DE SEMANA') || hitoNombre.includes('FIN SEMANA')) {
        // Friday tasks - find which Friday this task corresponds to
        tipo = 'fin_semana'
        const fridays = getFridaysInMonth(year, month)
        
        // Find the Friday closest to or after the creation date
        for (const friday of fridays) {
          if (friday >= createdAt || friday.toDateString() === createdAt.toDateString()) {
            fechaVencimiento = friday
            break
          }
        }
        // If no Friday found after creation, use the last Friday of the month
        if (!fechaVencimiento && fridays.length > 0) {
          fechaVencimiento = fridays[fridays.length - 1]
        }
        
      } else {
        // Regular hitos - deadline is last day of the month
        tipo = 'regular'
        fechaVencimiento = getLastDayOfMonth(year, month)
      }

      if (fechaVencimiento) {
        // Set time to end of day
        fechaVencimiento.setHours(23, 59, 59, 999)
        updates.push({
          id: task.id,
          fecha_vencimiento: fechaVencimiento.toISOString(),
          tipo,
        })
      }
    }

    // Batch update all tasks
    let successCount = 0
    let errorCount = 0

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('tareas')
        .update({ fecha_vencimiento: update.fecha_vencimiento })
        .eq('id', update.id)

      if (updateError) {
        console.error(`[backfill-hito-dates] Error updating task ${update.id}:`, updateError)
        errorCount++
      } else {
        successCount++
      }
    }

    console.log(`[backfill-hito-dates] Updated ${successCount} tasks, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      totalTasks: hitoTasks.length,
      updated: successCount,
      errors: errorCount,
      breakdown: {
        inicio_semana: updates.filter(u => u.tipo === 'inicio_semana').length,
        fin_semana: updates.filter(u => u.tipo === 'fin_semana').length,
        regular: updates.filter(u => u.tipo === 'regular').length,
      },
    })

  } catch (error) {
    console.error('[backfill-hito-dates] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
