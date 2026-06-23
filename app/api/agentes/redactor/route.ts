import { createClient } from '@supabase/supabase-js'
import { streamText, type CoreMessage } from 'ai'
import { getTemplateForMessage } from '@/lib/redactor-templates'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { clientId, tipo, cuentas, periodo, nivelCliente = 'esencial' } = body

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Get client data
    const { data: client, error: clientError } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Get completed tasks for this client ONLY
    const { data: tasks } = await supabase
      .from('tareas')
      .select('id, titulo, descripcion, estado')
      .or(`cliente_id.eq.${clientId},cliente_ids.cs.{${clientId}}`)
      .in('estado', ['completada', 'resuelto', 'en_progreso'])
      .limit(15)

    // Get comments for tasks to show recent activity
    let comentariosText = ''
    if (tasks && tasks.length > 0) {
      const taskIds = tasks.map(t => t.id)
      const { data: comentarios } = await supabase
        .from('comentarios_tareas')
        .select('contenido, autor_nombre')
        .in('tarea_id', taskIds)
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (comentarios && comentarios.length > 0) {
        comentariosText = comentarios.map(c => `${c.contenido}`).join('\n')
      }
    }

    // Get advertising account metrics - MANDATORY
    let inversion = 0
    let leads = 0
    let cpl = 0
    let impresiones = 0
    let clics = 0

    const startDate = periodo?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = periodo?.end || new Date().toISOString().split('T')[0]
    
    // Get metrics from agentes_metricas
    const { data: metricsData } = await supabase
      .from('agentes_metricas')
      .select('*')
      .eq('cliente_id', clientId)
      .gte('fecha', startDate)
      .lte('fecha', endDate)
      .order('fecha', { ascending: false })
      .limit(1)
    
    if (metricsData && metricsData.length > 0) {
      const metric = metricsData[0]
      inversion = parseFloat(metric.gasto_total || 0)
      leads = parseInt(metric.leads || 0)
      cpl = parseFloat(metric.cpl || 0)
      impresiones = parseInt(metric.impresiones || 0)
      clics = parseInt(metric.clics || 0)
    }

    // Get template for the message
    const template = getTemplateForMessage(tipo, nivelCliente)

    // Extract task titles for context
    const tasksText = tasks && tasks.length > 0
      ? tasks.map(t => t.titulo).join(', ')
      : 'Sin tareas específicas'

    const systemPrompt = `Eres un redactor experto en mensajes para agencia digital. Tu trabajo es generar mensajes profesionales siguiendo EXACTAMENTE una plantilla predefinida.

# INFORMACIÓN DEL CLIENTE
- Nombre: ${client.nombre_del_negocio}
- Industria: ${client.industria || 'No especificada'}
- Contacto: ${client.contacto_principal || 'No especificado'}

# TAREAS RECIENTES
${tasksText}

# COMENTARIOS RECIENTES
${comentariosText || 'No hay comentarios'}

# DATOS DE CAMPAÑA OBLIGATORIOS (PERÍODO: ${startDate} al ${endDate})
- Inversión Total: $${inversion.toFixed(2)}
- Leads/Conversiones: ${leads}
- CPL Promedio: $${cpl.toFixed(2)}
- Impresiones: ${impresiones.toLocaleString()}
- Clics: ${clics.toLocaleString()}

# PLANTILLA A SEGUIR
Debes generar el mensaje EXACTAMENTE siguiendo esta plantilla, reemplazando los placeholders con información real del cliente:

${template}

# INSTRUCCIONES CRÍTICAS
1. REEMPLAZA los placeholders [Nombre] con: ${client.nombre_del_negocio}
2. REEMPLAZA [MONTO] con: ${inversion.toFixed(2)}
3. REEMPLAZA [CANTIDAD] con: ${leads}
4. REEMPLAZA [VALOR] con: ${cpl.toFixed(2)}
5. REEMPLAZA los items de ejemplo con contexto REAL del cliente
6. Mantén TODOS los emojis y la estructura exacta
7. El mensaje DEBE incluir las tres métricas: Inversión, Leads y CPL
8. No agregues párrafos adicionales fuera de la plantilla
9. Respeta el tono y estructura exacta de la plantilla`

    const userMessage: CoreMessage = {
      role: 'user',
      content: `Genera el mensaje siguiendo EXACTAMENTE la plantilla proporcionada. Reemplaza todos los placeholders con información real. Las métricas son obligatorias en el mensaje.`
    }

    const result = streamText({
      model: 'openai/gpt-4o-mini',
      system: systemPrompt,
      messages: [userMessage],
    })

    return result.toTextStreamResponse()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
