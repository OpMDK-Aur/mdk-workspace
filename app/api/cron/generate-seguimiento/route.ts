import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Este endpoint se llama automáticamente cada lunes via Vercel Cron
// Configurar en vercel.json: { "crons": [{ "path": "/api/cron/generate-seguimiento", "schedule": "0 7 * * 1" }] }

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

export async function GET(request: Request) {
  try {
    // Verificar que es una llamada del cron de Vercel
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // En desarrollo, permitir sin auth
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const supabase = await createClient()
    
    // Fecha del lunes actual
    const today = new Date()
    today.setHours(10, 0, 0, 0)
    const dueDateStr = today.toISOString()
    const weekStart = today.toISOString().split('T')[0]

    // Cargar todos los clientes activos
    const { data: clientes, error: clientesError } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, plan, contact_name, project_manager_id, status')
      .in('status', ['verde', 'amarillo', 'naranja'])
      .order('nombre_del_negocio')

    if (clientesError || !clientes) {
      return NextResponse.json({ error: 'Error al cargar clientes' }, { status: 500 })
    }

    // Verificar tareas existentes para esta semana
    const { data: existingTasks } = await supabase
      .from('tareas')
      .select('cliente_id')
      .eq('tipo_tarea_id', 'seguimiento')
      .gte('fecha_vencimiento', weekStart)

    const existingClientIds = new Set(existingTasks?.map(t => t.cliente_id) || [])

    // Buscar tipo de tarea
    const { data: tipoTarea } = await supabase
      .from('tipos_tarea')
      .select('id')
      .eq('nombre', 'Seguimiento')
      .single()

    // Crear tareas
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
          estado: 'pendiente',
          prioridad: 'media',
          fecha_vencimiento: dueDateStr,
          tipo_tarea_id: tipoTarea?.id || null,
          metadata: {
            tipo: 'seguimiento_semanal',
            plan: cliente.plan,
            plantilla: templateMessage,
            semana: weekStart,
            generado_automaticamente: true,
          }
        }
      })

    if (tareasToCreate.length === 0) {
      return NextResponse.json({ 
        message: 'No hay tareas nuevas para crear',
        created: 0,
        existing: existingClientIds.size
      })
    }

    const { data: createdTasks, error: insertError } = await supabase
      .from('tareas')
      .insert(tareasToCreate)
      .select()

    if (insertError) {
      return NextResponse.json({ error: 'Error al crear tareas' }, { status: 500 })
    }

    console.log(`[Cron] Created ${createdTasks?.length} seguimiento tasks for week ${weekStart}`)

    return NextResponse.json({
      success: true,
      created: createdTasks?.length || 0,
      skipped: existingClientIds.size,
      weekStart,
    })

  } catch (error) {
    console.error('[Cron] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
