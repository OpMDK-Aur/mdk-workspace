import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Templates de LUNES por plan
const LUNES_TEMPLATES = {
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

// Templates de VIERNES por plan
const VIERNES_TEMPLATES = {
  estrategico: (clientName: string) => `¡Hola ${clientName}! 👋 Cerramos la semana en **MDK** con los avances y métricas clave de tu cuenta:

✅ **Hitos Completados:**
- **Logro 1:** [Ej: Campaña de X lanzada con éxito]
- **Logro 2:** [Ej: Ajuste técnico de la plataforma finalizado]

📊 **Métricas de Gestión (Corte al viernes):**
- **Métrica A:** [Valor] (Ej: +15% en Leads vs. semana pasada)
- **Métrica B:** [Valor] (Ej: CPC promedio en $XX)
- **Métrica C:** [Valor] (Ej: [Cantidad] de tickets resueltos)

💡 **Conclusión:** [Una frase corta sobre qué significan estos números. Ej: "Los ajustes de pauta del martes ya muestran una mejora en el costo por conversión"].

⏭️ **Próximos pasos:** [Lo más importante para el lunes/martes].

¡Buen fin de semana para todo el equipo! 🥂`,

  esencial: (clientName: string) => `¡Hola ${clientName}! 👋 Cerramos la semana con tu cuenta al día.

✅ Lo que hicimos: [Una sola línea. Ej: Optimizamos las campañas de búsqueda y ajustamos el presupuesto diario.]

📊 Número de la semana: [Un solo KPI relevante. Ej: CPL esta semana: $XX — estable vs semana anterior.]

⏭️ La semana que viene: [Una sola acción. Ej: Arrancamos con los nuevos creativos aprobados.]

¡Buen finde! 🙌`,
}

const getTemplate = (plan: string | null | undefined, clientName: string, dayType: 'lunes' | 'viernes'): string => {
  const planLower = (plan || '').toLowerCase()
  const templates = dayType === 'lunes' ? LUNES_TEMPLATES : VIERNES_TEMPLATES
  
  if (planLower.includes('estrat')) {
    return templates.estrategico(clientName)
  }
  return templates.esencial(clientName)
}

// Calcular fechas de lunes y viernes de la semana actual o proxima
const getWeekDates = () => {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Dom, 1=Lun, ..., 6=Sab
  
  // Calcular el proximo lunes (o hoy si es lunes)
  const monday = new Date(today)
  if (dayOfWeek === 0) {
    // Domingo -> lunes es manana
    monday.setDate(monday.getDate() + 1)
  } else if (dayOfWeek === 1) {
    // Lunes -> usar hoy
  } else {
    // Mar-Sab -> proximo lunes
    monday.setDate(monday.getDate() + (8 - dayOfWeek))
  }
  monday.setHours(10, 0, 0, 0)
  
  // Viernes es lunes + 4 dias
  const friday = new Date(monday)
  friday.setDate(friday.getDate() + 4)
  friday.setHours(10, 0, 0, 0)
  
  return { monday, friday, weekStart: monday.toISOString().split('T')[0] }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Verificar autenticacion
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { monday, friday, weekStart } = getWeekDates()

    // Cargar todos los clientes
    const { data: clientes, error: clientesError } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, plan, contact_name, project_manager_id')
      .order('nombre_del_negocio')

    if (clientesError) {
      return NextResponse.json({ error: 'Error al cargar clientes', details: clientesError }, { status: 500 })
    }

    if (!clientes || clientes.length === 0) {
      return NextResponse.json({ message: 'No hay clientes', created: 0 })
    }

    // Verificar tareas de seguimiento existentes para esta semana
    const { data: existingTasks } = await supabase
      .from('tareas')
      .select('cliente_id, metadata')
      .ilike('titulo', '%Seguimiento%')
      .gte('fecha_vencimiento', weekStart)
      .lt('fecha_vencimiento', new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

    // Crear set de tareas existentes por cliente y dia
    const existingLunes = new Set<string>()
    const existingViernes = new Set<string>()
    
    existingTasks?.forEach(t => {
      const tipo = t.metadata?.tipo_seguimiento
      if (tipo === 'lunes') {
        existingLunes.add(t.cliente_id)
      } else if (tipo === 'viernes') {
        existingViernes.add(t.cliente_id)
      } else {
        // Si no tiene tipo, asumimos que es lunes (compatibilidad)
        existingLunes.add(t.cliente_id)
      }
    })

    // Buscar el tipo de tarea "Seguimiento"
    const { data: tipoTarea } = await supabase
      .from('tipos_tarea')
      .select('id')
      .ilike('nombre', '%Seguimiento%')
      .single()

    const tipoTareaId = tipoTarea?.id || null

    // Crear array de tareas a insertar
    const tareasToCreate: any[] = []

    clientes.forEach(cliente => {
      const clientName = cliente.contact_name || cliente.nombre_del_negocio || 'equipo'
      
      // Tarea de LUNES si no existe
      if (!existingLunes.has(cliente.id)) {
        tareasToCreate.push({
          titulo: `Seguimiento Lunes - ${cliente.nombre_del_negocio}`,
          descripcion: `Enviar mensaje de inicio de semana al cliente.`,
          cliente_id: cliente.id,
          asignado_a: cliente.project_manager_id,
          creado_por: user.id,
          estado: 'pendiente',
          prioridad: 'media',
          fecha_vencimiento: monday.toISOString(),
          tipo_tarea_id: tipoTareaId,
          metadata: {
            tipo_seguimiento: 'lunes',
            plan: cliente.plan,
            plantilla: getTemplate(cliente.plan, clientName, 'lunes'),
            semana: weekStart,
          }
        })
      }
      
      // Tarea de VIERNES si no existe
      if (!existingViernes.has(cliente.id)) {
        tareasToCreate.push({
          titulo: `Seguimiento Viernes - ${cliente.nombre_del_negocio}`,
          descripcion: `Enviar mensaje de cierre de semana al cliente.`,
          cliente_id: cliente.id,
          asignado_a: cliente.project_manager_id,
          creado_por: user.id,
          estado: 'pendiente',
          prioridad: 'media',
          fecha_vencimiento: friday.toISOString(),
          tipo_tarea_id: tipoTareaId,
          metadata: {
            tipo_seguimiento: 'viernes',
            plan: cliente.plan,
            plantilla: getTemplate(cliente.plan, clientName, 'viernes'),
            semana: weekStart,
          }
        })
      }
    })

    if (tareasToCreate.length === 0) {
      return NextResponse.json({ 
        message: 'Todas las tareas de seguimiento ya fueron creadas para esta semana',
        created: 0,
        existingLunes: existingLunes.size,
        existingViernes: existingViernes.size
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

    const lunesCreadas = tareasToCreate.filter(t => t.metadata.tipo_seguimiento === 'lunes').length
    const viernesCreadas = tareasToCreate.filter(t => t.metadata.tipo_seguimiento === 'viernes').length

    return NextResponse.json({
      message: `Se crearon ${createdTasks?.length || 0} tareas de seguimiento`,
      created: createdTasks?.length || 0,
      lunesCreadas,
      viernesCreadas,
      monday: monday.toISOString(),
      friday: friday.toISOString(),
    })

  } catch (error) {
    console.error('Error generating seguimiento tasks:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// GET para verificar estado
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { monday, friday, weekStart } = getWeekDates()

    // Contar clientes
    const { count: totalClientes } = await supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })

    // Contar tareas de seguimiento ya creadas para esta semana
    const { data: existingTasks } = await supabase
      .from('tareas')
      .select('metadata')
      .ilike('titulo', '%Seguimiento%')
      .gte('fecha_vencimiento', weekStart)
      .lt('fecha_vencimiento', new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

    const lunesCount = existingTasks?.filter(t => t.metadata?.tipo_seguimiento === 'lunes' || !t.metadata?.tipo_seguimiento).length || 0
    const viernesCount = existingTasks?.filter(t => t.metadata?.tipo_seguimiento === 'viernes').length || 0

    return NextResponse.json({
      weekStart,
      monday: monday.toISOString(),
      friday: friday.toISOString(),
      totalClientes: totalClientes || 0,
      tareasLunes: lunesCount,
      tareasViernes: viernesCount,
      pendientesLunes: (totalClientes || 0) - lunesCount,
      pendientesViernes: (totalClientes || 0) - viernesCount,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al verificar estado' }, { status: 500 })
  }
}
