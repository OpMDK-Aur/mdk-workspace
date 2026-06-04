import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use admin client to bypass RLS
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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
    const supabase = getAdminClient()

    // Fetch ALL hito tasks using pagination (Supabase default limit is 1000)
    let allHitoTasks: { id: string; titulo: string; hito_poe: string | null; created_at: string; fecha_vencimiento: string | null }[] = []
    let page = 0
    const pageSize = 1000
    
    while (true) {
      const { data: hitoTasks, error: fetchError } = await supabase
        .from('tareas')
        .select('id, titulo, hito_poe, created_at, fecha_vencimiento')
        .or('hito_poe.not.is.null,titulo.ilike.[Hito]%')
        .range(page * pageSize, (page + 1) * pageSize - 1)
      
      if (fetchError) {
        console.error('[backfill-hito-dates] Error fetching tasks:', fetchError)
        return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
      }
      
      if (!hitoTasks || hitoTasks.length === 0) break
      
      allHitoTasks = allHitoTasks.concat(hitoTasks)
      page++
      
      if (hitoTasks.length < pageSize) break
    }

    if (allHitoTasks.length === 0) {
      return NextResponse.json({ success: true, message: 'No hito tasks found', updated: 0 })
    }

    // Fetch hitos_config to get hito names
    const hitoIds = [...new Set(allHitoTasks.map(t => t.hito_poe).filter(Boolean))]
    const { data: hitosConfig } = await supabase
      .from('hitos_config')
      .select('id, nombre')
      .in('id', hitoIds as string[])

    const hitosMap = new Map((hitosConfig || []).map(h => [h.id, h.nombre]))

    console.log(`[backfill-hito-dates] Processing ${allHitoTasks.length} hito tasks`)

    const updates: { id: string; fecha_vencimiento: string; tipo: string }[] = []

    for (const task of allHitoTasks) {
      // Use hito name from config, or fall back to task title
      const hitoNombre = (task.hito_poe ? hitosMap.get(task.hito_poe) : null) || task.titulo || ''
      const hitoNombreUpper = hitoNombre.toUpperCase()
      
      // Determine the month/year from created_at
      const createdAt = task.created_at ? new Date(task.created_at) : new Date()
      const year = createdAt.getFullYear()
      const month = createdAt.getMonth()

      let fechaVencimiento: Date | null = null
      let tipo = 'regular'

      if (hitoNombreUpper.includes('INICIO DE SEMANA') || hitoNombreUpper.includes('INICIO SEMANA')) {
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
        
      } else if (hitoNombreUpper.includes('FIN DE SEMANA') || hitoNombreUpper.includes('FIN SEMANA')) {
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
      totalTasks: allHitoTasks.length,
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
