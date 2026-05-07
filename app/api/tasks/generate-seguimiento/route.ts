import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Templates de seguimiento por plan
const SEGUIMIENTO_TEMPLATES = {
  estrategico: (clientName: string) => `¡Hola ${clientName}! 👋 Buen lunes.

Desde el equipo de Operaciones de **MDK** te compartimos los hitos clave en los que vamos a estar trabajando en tu cuenta esta semana:

🎯 **Foco principal:** [Ej: Optimización de campañas post-informe de cierre / Lanzamiento de la nueva segmentación]

✅ **Checklist de la semana:**
— [Item 1: acción concreta]
— [Item 2: seguimiento o ajuste técnico]
— [Item 3: preparación de reporte o análisis]

🚀 **Objetivo:** [Resultado esperado. Ej: Recuperar el CPL a los niveles de la semana 2 del mes anterior.]`,

  esencial: (clientName: string) => `¡Hola ${clientName}! 👋 Buen lunes.

Esta semana en tu cuenta vamos a estar trabajando en:

🎯 [Una sola línea con el foco de la semana. Ej: Optimización de campañas y revisión de trackeo.]

🚀 Objetivo: [Una sola línea. Ej: Mantener el CPL dentro del rango acordado.]

Cualquier consulta, acá estamos. 💪`,
}

const getSeguimientoTemplate = (plan: string | null | undefined, clientName: string): string => {
  const planLower = (plan || '').toLowerCase()
  if (planLower.includes('estrat')) {
    return SEGUIMIENTO_TEMPLATES.estrategico(clientName)
  }
  return SEGUIMIENTO_TEMPLATES.esencial(clientName)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Verificar autenticación
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener fecha de hoy (lunes)
    const today = new Date()
    const dayOfWeek = today.getDay()
    
    // Calcular fecha del próximo lunes si no es lunes
    const dueDate = new Date(today)
    if (dayOfWeek !== 1) {
      // Si no es lunes, calcular el próximo lunes
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
      dueDate.setDate(dueDate.getDate() + daysUntilMonday)
    }
    dueDate.setHours(10, 0, 0, 0) // 10:00 AM
    
    const dueDateStr = dueDate.toISOString()
    const weekStart = dueDate.toISOString().split('T')[0]

    // Cargar todos los clientes activos
    const { data: clientes, error: clientesError } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, plan, contact_name, project_manager_id, status')
      .in('status', ['verde', 'amarillo', 'naranja']) // Solo clientes activos
      .order('nombre_del_negocio')

    if (clientesError) {
      return NextResponse.json({ error: 'Error al cargar clientes', details: clientesError }, { status: 500 })
    }

    if (!clientes || clientes.length === 0) {
      return NextResponse.json({ message: 'No hay clientes activos', created: 0 })
    }

    // Verificar si ya existen tareas de seguimiento para esta semana
    const { data: existingTasks } = await supabase
      .from('tareas')
      .select('cliente_id')
      .eq('tipo_tarea_id', 'seguimiento')
      .gte('fecha_vencimiento', weekStart)
      .lt('fecha_vencimiento', new Date(dueDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

    const existingClientIds = new Set(existingTasks?.map(t => t.cliente_id) || [])

    // Buscar el tipo de tarea "seguimiento"
    const { data: tipoTarea } = await supabase
      .from('tipos_tarea')
      .select('id')
      .eq('nombre', 'Seguimiento')
      .single()

    const tipoTareaId = tipoTarea?.id || null

    // Crear tareas para cada cliente que no tenga una esta semana
    const tareasToCreate = clientes
      .filter(c => !existingClientIds.has(c.id))
      .map(cliente => {
        const clientName = cliente.contact_name || cliente.nombre_del_negocio || 'equipo'
        const templateMessage = getSeguimientoTemplate(cliente.plan, clientName)
        
        return {
          titulo: `Seguimiento semanal - ${cliente.nombre_del_negocio}`,
          descripcion: `Enviar mensaje de seguimiento semanal al cliente.`,
          cliente_id: cliente.id,
          asignado_a: cliente.project_manager_id,
          creado_por: user.id,
          estado: 'pendiente',
          prioridad: 'media',
          fecha_vencimiento: dueDateStr,
          tipo_tarea_id: tipoTareaId,
          metadata: {
            tipo: 'seguimiento_semanal',
            plan: cliente.plan,
            plantilla: templateMessage,
            semana: weekStart,
          }
        }
      })

    if (tareasToCreate.length === 0) {
      return NextResponse.json({ 
        message: 'Todas las tareas de seguimiento ya fueron creadas para esta semana',
        created: 0,
        existing: existingClientIds.size
      })
    }

    // Insertar las tareas
    const { data: createdTasks, error: insertError } = await supabase
      .from('tareas')
      .insert(tareasToCreate)
      .select()

    if (insertError) {
      return NextResponse.json({ error: 'Error al crear tareas', details: insertError }, { status: 500 })
    }

    return NextResponse.json({
      message: `Se crearon ${createdTasks?.length || 0} tareas de seguimiento`,
      created: createdTasks?.length || 0,
      skipped: existingClientIds.size,
      dueDate: dueDateStr,
    })

  } catch (error) {
    console.error('[v0] Error generating seguimiento tasks:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// GET para verificar estado
export async function GET() {
  try {
    const supabase = await createClient()
    
    const today = new Date()
    const dayOfWeek = today.getDay()
    const dueDate = new Date(today)
    if (dayOfWeek !== 1) {
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
      dueDate.setDate(dueDate.getDate() + daysUntilMonday)
    }
    const weekStart = dueDate.toISOString().split('T')[0]

    // Contar clientes activos
    const { count: totalClientes } = await supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['verde', 'amarillo', 'naranja'])

    // Contar tareas de seguimiento ya creadas para esta semana
    const { count: tareasCreadas } = await supabase
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .eq('tipo_tarea_id', 'seguimiento')
      .gte('fecha_vencimiento', weekStart)

    return NextResponse.json({
      weekStart,
      totalClientes: totalClientes || 0,
      tareasCreadas: tareasCreadas || 0,
      pendientes: (totalClientes || 0) - (tareasCreadas || 0),
      isMonday: dayOfWeek === 1,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al verificar estado' }, { status: 500 })
  }
}
