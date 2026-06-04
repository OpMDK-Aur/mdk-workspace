import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use admin client to bypass RLS
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const supabase = getAdminClient()

    // Find all tareas with estado = 'no_realizado' that have hito_poe (hito tasks)
    const { data: tareas, error: tareasError } = await supabase
      .from('tareas')
      .select('id, estado, titulo, hito_poe, created_at')
      .eq('estado', 'no_realizado')
      .not('hito_poe', 'is', null)

    if (tareasError) {
      return NextResponse.json({ success: false, error: tareasError.message }, { status: 500 })
    }

    if (!tareas || tareas.length === 0) {
      return NextResponse.json({ success: true, message: 'No no_realizado hito tasks found', updated: 0 })
    }

    // Get unique hito_poe ids
    const hitoPoeIds = [...new Set(tareas.map(t => t.hito_poe).filter(Boolean))]

    // Get all instances with matching hito_config_id
    const { data: instancias, error: instanciasError } = await supabase
      .from('mapa_servicio_instancias')
      .select('id, tarea_id, estado, hito_config_id, cliente_id, mes, anio')
      .in('hito_config_id', hitoPoeIds)

    if (instanciasError) {
      return NextResponse.json({ success: false, error: instanciasError.message }, { status: 500 })
    }

    // Get tareas' client info
    const tareaIds = tareas.map(t => t.id)
    const { data: tareaClientes } = await supabase
      .from('tareas_clientes')
      .select('tarea_id, cliente_id')
      .in('tarea_id', tareaIds)

    // Build map: tarea_id -> cliente_id
    const tareaToCliente = new Map((tareaClientes || []).map(tc => [tc.tarea_id, tc.cliente_id]))

    // Build map: hito_poe + cliente_id + mes/anio -> tarea
    const tareaMap = new Map<string, typeof tareas[0]>()
    for (const tarea of tareas) {
      const clienteId = tareaToCliente.get(tarea.id)
      if (!clienteId || !tarea.hito_poe) continue
      
      const createdAt = new Date(tarea.created_at)
      const mes = createdAt.getMonth() + 1
      const anio = createdAt.getFullYear()
      
      const key = `${tarea.hito_poe}::${clienteId}::${mes}::${anio}`
      tareaMap.set(key, tarea)
    }

    let updated = 0
    let errors = 0
    let linked = 0

    for (const instancia of (instancias || [])) {
      const key = `${instancia.hito_config_id}::${instancia.cliente_id}::${instancia.mes}::${instancia.anio}`
      const tarea = tareaMap.get(key)
      
      if (!tarea) continue

      const updates: { estado?: string; tarea_id?: string } = {}
      
      // Update estado if needed
      if (instancia.estado !== 'no_realizado') {
        updates.estado = 'no_realizado'
      }
      
      // Link tarea_id if not linked
      if (!instancia.tarea_id) {
        updates.tarea_id = tarea.id
        linked++
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('mapa_servicio_instancias')
          .update(updates)
          .eq('id', instancia.id)

        if (error) {
          console.error(`Error updating instance ${instancia.id}:`, error)
          errors++
        } else {
          if (updates.estado) updated++
          console.log(`Updated instance ${instancia.id}: estado=${updates.estado || 'unchanged'}, tarea_id=${updates.tarea_id || 'unchanged'}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalTareas: tareas.length,
      totalInstancias: instancias?.length || 0,
      estadoUpdated: updated,
      tareaIdLinked: linked,
      errors,
    })
  } catch (error) {
    console.error('[sync-instance-estados] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
