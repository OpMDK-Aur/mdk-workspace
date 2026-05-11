import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const MDK_UNIDAD_ID = 'afcc1aa2-d63d-4b03-b68a-e7e89bc7bd3c'

// Get next 4 Fridays starting from today
function getNextFridays(): Date[] {
  const today = new Date()
  const fridays: Date[] = []
  
  let nextFriday = new Date(today)
  const day = nextFriday.getDay()
  const diff = (5 - day + 7) % 7 || 7
  nextFriday.setDate(nextFriday.getDate() + diff)
  nextFriday.setHours(10, 0, 0, 0)
  
  // If today is Friday and before 6pm, include today
  if (today.getDay() === 5 && today.getHours() < 18) {
    nextFriday = new Date(today)
    nextFriday.setHours(10, 0, 0, 0)
  }
  
  for (let i = 0; i < 4; i++) {
    fridays.push(new Date(nextFriday))
    nextFriday.setDate(nextFriday.getDate() + 7)
  }
  
  return fridays
}

// POST: Generate seguimiento tasks for MDK clients only
export async function POST() {
  const supabase = await createClient()
  
  try {
    // Get clients that have MDK as unidad de negocio, including account_manager_id
    const { data: mdkClients, error: clientsError } = await supabase
      .from('clientes_unidades_de_negocio')
      .select('cliente_id, clientes(id, nombre_del_negocio, account_manager_id)')
      .eq('unidad_de_negocio_id', MDK_UNIDAD_ID)
    
    if (clientsError) {
      console.error('Error fetching MDK clients:', clientsError)
      return NextResponse.json({ error: clientsError.message }, { status: 500 })
    }
    
    if (!mdkClients || mdkClients.length === 0) {
      return NextResponse.json({ message: 'No MDK clients found', created: 0 })
    }
    
    const fridays = getNextFridays()
    const tasksToCreate: Array<{
      titulo: string
      descripcion: string
      cliente_id: string
      tipo_tarea_id: string | null
      asignado_a: string | null
      estado: string
      prioridad: string
      fecha_vencimiento: string
    }> = []
    
    // Get tipo_tarea_id for "Seguimiento" if it exists
    const { data: tipoTarea } = await supabase
      .from('tipo_de_tareas')
      .select('id')
      .ilike('nombre', '%Seguimiento%')
      .single()
    
    // Get date range for all fridays
    const firstFriday = fridays[0]
    const lastFriday = fridays[fridays.length - 1]
    const rangeStart = new Date(firstFriday)
    rangeStart.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(lastFriday)
    rangeEnd.setHours(23, 59, 59, 999)
    
    // Get all existing seguimiento tasks in one query
    const clientIds = mdkClients
      .map(c => (c.clientes as { id: string } | null)?.id)
      .filter(Boolean) as string[]
    
    const { data: existingTasks } = await supabase
      .from('tareas')
      .select('cliente_id, fecha_vencimiento')
      .in('cliente_id', clientIds)
      .gte('fecha_vencimiento', rangeStart.toISOString())
      .lte('fecha_vencimiento', rangeEnd.toISOString())
      .ilike('titulo', '%Seguimiento semanal%')
    
    // Create a set of existing task keys for fast lookup
    const existingKeys = new Set(
      (existingTasks || []).map(t => {
        const date = new Date(t.fecha_vencimiento)
        return `${t.cliente_id}-${date.toISOString().split('T')[0]}`
      })
    )
    
    for (const mdkClient of mdkClients) {
      const cliente = mdkClient.clientes as { id: string; nombre_del_negocio: string; account_manager_id: string | null } | null
      if (!cliente) continue
      
      for (const friday of fridays) {
        const dateKey = `${cliente.id}-${friday.toISOString().split('T')[0]}`
        
        if (!existingKeys.has(dateKey)) {
          tasksToCreate.push({
            titulo: `Seguimiento semanal - ${cliente.nombre_del_negocio}`,
            descripcion: `<p><strong>Enviar reporte de metricas al cliente:</strong></p>
<ul>
<li>Clics de la semana</li>
<li>Impresiones totales</li>
<li>Conversiones logradas</li>
<li>Costo publicitario</li>
</ul>`,
            cliente_id: cliente.id,
            tipo_tarea_id: tipoTarea?.id ?? null,
            asignado_a: cliente.account_manager_id,
            estado: 'pendiente',
            prioridad: 'media',
            fecha_vencimiento: friday.toISOString(),
          })
        }
      }
    }
    
    if (tasksToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('tareas')
        .insert(tasksToCreate)
      
      if (insertError) {
        console.error('Error creating tasks:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }
    
    return NextResponse.json({ 
      message: 'Seguimiento tasks generated for MDK clients',
      created: tasksToCreate.length,
      clients: mdkClients.length
    })
  } catch (error) {
    console.error('Error in generate-seguimiento:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Remove seguimiento tasks for non-MDK clients
export async function DELETE() {
  const supabase = await createClient()
  
  try {
    // Get all client IDs that have MDK
    const { data: mdkClients } = await supabase
      .from('clientes_unidades_de_negocio')
      .select('cliente_id')
      .eq('unidad_de_negocio_id', MDK_UNIDAD_ID)
    
    const mdkClientIds = mdkClients?.map(c => c.cliente_id) ?? []
    
    // Delete seguimiento tasks for clients NOT in MDK list
    let query = supabase
      .from('tareas')
      .delete()
      .ilike('titulo', '%Seguimiento semanal%')
    
    if (mdkClientIds.length > 0) {
      // Delete where cliente_id is NOT in the MDK clients list
      query = query.not('cliente_id', 'in', `(${mdkClientIds.join(',')})`)
    }
    
    const { error, count } = await query.select('id')
    
    if (error) {
      console.error('Error deleting non-MDK seguimiento tasks:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ 
      message: 'Deleted seguimiento tasks for non-MDK clients',
      deleted: count ?? 0
    })
  } catch (error) {
    console.error('Error in delete seguimiento:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
