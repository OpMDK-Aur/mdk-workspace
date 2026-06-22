import { createClient } from '@supabase/supabase-js'
import { streamText, type CoreMessage } from 'ai'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { clientId, tipo, cuentas, periodo } = body

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
        comentariosText = '\n\nÚltimas actualizaciones:\n' + 
          comentarios.map(c => `• ${c.autor_nombre}: ${c.contenido.substring(0, 60)}...`).join('\n')
      }
    }

    // Get advertising account metrics
    let metricsText = ''
    const startDate = periodo?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = periodo?.end || new Date().toISOString().split('T')[0]
    
    // Try to get metrics from agentes_metricas or similar table if available
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
      metricsText = `\n\nMétricas del Período (${startDate} al ${endDate}):\n`
      if (metric.gasto_total) metricsText += `• Inversión: $${parseFloat(metric.gasto_total).toFixed(2)}\n`
      if (metric.leads) metricsText += `• Leads/Conversiones: ${metric.leads}\n`
      if (metric.cpl) metricsText += `• CPL Promedio: $${parseFloat(metric.cpl).toFixed(2)}\n`
      if (metric.impresiones) metricsText += `• Impresiones: ${metric.impresiones.toLocaleString()}\n`
      if (metric.clics) metricsText += `• Clics: ${metric.clics.toLocaleString()}\n`
    }

    // Build system prompt with template format
    const tasksText = tasks && tasks.length > 0
      ? tasks.map(t => `• ${t.titulo}${t.descripcion ? ': ' + t.descripcion.substring(0, 80) : ''}`).join('\n')
      : 'Sin tareas registradas'

    const systemPrompt = `Eres un redactor profesional de una agencia digital. Tu rol es generar mensajes personalizados y contextualizados para clientes.

# INFORMACIÓN DEL CLIENTE
Nombre: ${client.nombre_del_negocio || 'No especificado'}
Industria: ${client.industria || 'No especificada'}
Contacto Principal: ${client.contacto_principal || 'No especificado'}

# TRABAJO RECIENTE
${tasksText}${comentariosText}${metricsText}

# INSTRUCCIONES PARA EL MENSAJE
Genera un mensaje de ${tipo || 'bienvenida'} que:
- Sea cálido, profesional y personalizado
- Incluya datos específicos del cliente y sus campañas cuando sea relevante
- Demuestre comprensión profunda de su negocio
- Incluya una llamada a la acción clara
- Tenga 3-4 párrafos máximo
- Esté completamente en español con tono natural

# PLANTILLA OBLIGATORIA
El mensaje DEBE seguir exactamente esta estructura:

Asunto: [Línea de asunto compelling y personalizada]

[Saludo personalizado con el nombre del cliente]

[Párrafo principal: menciona logros específicos, trabajos recientes o métricas si están disponibles]

[Párrafo 2: propuesta de valor o siguiente paso]

[Despedida profesional con nombre y cargo]

IMPORTANTE: Respeta esta estructura exactamente. No omitas ninguna sección.`

    const userMessage: CoreMessage = {
      role: 'user',
      content: `Genera un mensaje de ${tipo || 'bienvenida'} para ${client.nombre_del_negocio}`
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
