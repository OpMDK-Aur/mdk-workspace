import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Templates de LUNES por plan
const LUNES_TEMPLATES = {
  estrategico: (clientName: string) => `Hola ${clientName}! Buen lunes.

Desde el equipo de Operaciones de MDK te compartimos los hitos clave en los que vamos a estar trabajando en tu cuenta esta semana:

Foco principal: [Ej: Optimizacion de campanas post-informe de cierre / Lanzamiento de la nueva segmentacion]

Checklist de la semana:
- [Item 1: accion concreta]
- [Item 2: seguimiento o ajuste tecnico]
- [Item 3: preparacion de reporte o analisis]

Objetivo: [Resultado esperado. Ej: Recuperar el CPL a los niveles de la semana 2 del mes anterior.]`,

  esencial: (clientName: string) => `Hola ${clientName}! Buen lunes.

Esta semana en tu cuenta vamos a estar trabajando en:

[Una sola linea con el foco de la semana. Ej: Optimizacion de campanas y revision de trackeo.]

Objetivo: [Una sola linea. Ej: Mantener el CPL dentro del rango acordado.]

Cualquier consulta, aca estamos.`,
}

// Templates de VIERNES por plan
const VIERNES_TEMPLATES = {
  estrategico: (clientName: string) => `Hola ${clientName}! Cerramos la semana en MDK con los avances y metricas clave de tu cuenta:

Hitos Completados:
- Logro 1: [Ej: Campana de X lanzada con exito]
- Logro 2: [Ej: Ajuste tecnico de la plataforma finalizado]

Metricas de Gestion (Corte al viernes):
- Metrica A: [Valor] (Ej: +15% en Leads vs. semana pasada)
- Metrica B: [Valor] (Ej: CPC promedio en $XX)
- Metrica C: [Valor] (Ej: [Cantidad] de tickets resueltos)

Conclusion: [Una frase corta sobre que significan estos numeros. Ej: "Los ajustes de pauta del martes ya muestran una mejora en el costo por conversion"].

Proximos pasos: [Lo mas importante para el lunes/martes].

Buen fin de semana para todo el equipo!`,

  esencial: (clientName: string) => `Hola ${clientName}! Cerramos la semana con tu cuenta al dia.

Lo que hicimos: [Una sola linea. Ej: Optimizamos las campanas de busqueda y ajustamos el presupuesto diario.]

Numero de la semana: [Un solo KPI relevante. Ej: CPL esta semana: $XX — estable vs semana anterior.]

La semana que viene: [Una sola accion. Ej: Arrancamos con los nuevos creativos aprobados.]

Buen finde!`,
}

const getTemplate = (plan: string | null | undefined, clientName: string, dayType: 'lunes' | 'viernes'): string => {
  const planLower = (plan || '').toLowerCase()
  const templates = dayType === 'lunes' ? LUNES_TEMPLATES : VIERNES_TEMPLATES
  
  if (planLower.includes('estrat')) {
    return templates.estrategico(clientName)
  }
  return templates.esencial(clientName)
}

// Calcular fechas de lunes y viernes de la semana actual
const getWeekDates = () => {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Dom, 1=Lun, ..., 6=Sab
  
  // Calcular el lunes de esta semana
  const monday = new Date(today)
  if (dayOfWeek === 0) {
    monday.setDate(monday.getDate() + 1)
  } else if (dayOfWeek === 1) {
    // Hoy es lunes
  } else {
    monday.setDate(monday.getDate() - (dayOfWeek - 1))
  }
  monday.setHours(10, 0, 0, 0)
  
  // Viernes es lunes + 4 dias
  const friday = new Date(monday)
  friday.setDate(friday.getDate() + 4)
  friday.setHours(10, 0, 0, 0)
  
  return { monday, friday, weekStart: monday.toISOString().split('T')[0] }
}

export async function POST() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { monday, friday, weekStart } = getWeekDates()

    // Cargar todos los clientes
    const { data: clientes, error: clientesError } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, plan, account_manager_id')
      .order('nombre_del_negocio')

    if (clientesError) {
      return NextResponse.json({ error: 'Error al cargar clientes', details: clientesError }, { status: 500 })
    }

    if (!clientes || clientes.length === 0) {
      return NextResponse.json({ message: 'No hay clientes', created: 0 })
    }

    // Buscar el tipo de tarea "Mapa de servicio"
    const { data: tipoTarea } = await supabase
      .from('tipo_de_tareas')
      .select('id')
      .ilike('nombre', '%Mapa de servicio%')
      .single()

    const tipoTareaId = tipoTarea?.id || null

    // Verificar tareas existentes para esta semana
    const { data: existingTasks } = await supabase
      .from('tareas')
      .select('cliente_id, titulo')
      .ilike('titulo', '%Seguimiento%')
      .gte('fecha_vencimiento', monday.toISOString())
      .lte('fecha_vencimiento', friday.toISOString())

    const existingLunes = new Set<string>()
    const existingViernes = new Set<string>()
    
    existingTasks?.forEach(t => {
      if (t.titulo?.toLowerCase().includes('lunes')) {
        existingLunes.add(t.cliente_id)
      } else if (t.titulo?.toLowerCase().includes('viernes')) {
        existingViernes.add(t.cliente_id)
      }
    })

    // Crear array de tareas
    const tareasToCreate: any[] = []

    clientes.forEach(cliente => {
      const clientName = cliente.nombre_del_negocio || 'equipo'
      
      // Tarea de LUNES
      if (!existingLunes.has(cliente.id)) {
        tareasToCreate.push({
          titulo: `Seguimiento Lunes - ${cliente.nombre_del_negocio}`,
          descripcion: getTemplate(cliente.plan, clientName, 'lunes'),
          cliente_id: cliente.id,
          asignado_a: cliente.account_manager_id,
          creado_por: user.id,
          estado: 'pendiente',
          prioridad: 'media',
          fecha_vencimiento: monday.toISOString(),
          tipo_tarea_id: tipoTareaId,
        })
      }
      
      // Tarea de VIERNES
      if (!existingViernes.has(cliente.id)) {
        tareasToCreate.push({
          titulo: `Seguimiento Viernes - ${cliente.nombre_del_negocio}`,
          descripcion: getTemplate(cliente.plan, clientName, 'viernes'),
          cliente_id: cliente.id,
          asignado_a: cliente.account_manager_id,
          creado_por: user.id,
          estado: 'pendiente',
          prioridad: 'media',
          fecha_vencimiento: friday.toISOString(),
          tipo_tarea_id: tipoTareaId,
        })
      }
    })

    if (tareasToCreate.length === 0) {
      return NextResponse.json({ 
        message: 'Todas las tareas ya existen',
        created: 0,
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
      message: `Se crearon ${createdTasks?.length || 0} tareas`,
      created: createdTasks?.length || 0,
      monday: monday.toISOString(),
      friday: friday.toISOString(),
    })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE para borrar tareas de seguimiento
export async function DELETE() {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Buscar el tipo de tarea "Mapa de servicio"
    const { data: tipoMapaServicio } = await supabase
      .from('tipo_de_tareas')
      .select('id')
      .ilike('nombre', '%Mapa de servicio%')
      .single()

    let totalDeleted = 0

    // 1. Borrar por tipo de tarea "Mapa de servicio"
    if (tipoMapaServicio?.id) {
      const { data: deleted1 } = await supabase
        .from('tareas')
        .delete()
        .eq('tipo_tarea_id', tipoMapaServicio.id)
        .select('id')
      
      totalDeleted += deleted1?.length || 0
    }

    // 2. Borrar por titulo que contenga "Seguimiento"
    const { data: deleted2 } = await supabase
      .from('tareas')
      .delete()
      .ilike('titulo', '%Seguimiento%')
      .select('id')
    
    totalDeleted += deleted2?.length || 0

    return NextResponse.json({
      message: `Se borraron ${totalDeleted} tareas`,
      deleted: totalDeleted,
    })
  } catch (error) {
    console.error('DELETE error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// GET para verificar estado
export async function GET() {
  try {
    const supabase = await createClient()
    const { monday, friday, weekStart } = getWeekDates()

    const { count: totalClientes } = await supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })

    const { data: existingTasks } = await supabase
      .from('tareas')
      .select('titulo')
      .ilike('titulo', '%Seguimiento%')
      .gte('fecha_vencimiento', monday.toISOString())
      .lte('fecha_vencimiento', friday.toISOString())

    return NextResponse.json({
      weekStart,
      monday: monday.toISOString(),
      friday: friday.toISOString(),
      totalClientes: totalClientes || 0,
      tareasExistentes: existingTasks?.length || 0,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
