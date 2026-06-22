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

    // Build system prompt with template format
    const tasksText = tasks && tasks.length > 0
      ? tasks.map(t => `• ${t.titulo}${t.descripcion ? ': ' + t.descripcion.substring(0, 80) : ''}`).join('\n')
      : 'Sin tareas registradas'

    const systemPrompt = `You are a professional copywriter for a digital marketing agency. Your role is to generate personalized, contextual messages for clients.

# Client Information
**Name:** ${client.nombre_del_negocio || 'Not specified'}
**Industry:** ${client.industria || 'Not specified'}
**Contact:** ${client.contacto_principal || 'Not specified'}

# Recent Work
${tasksText}${comentariosText}

# Message Requirements
Generate a professional ${tipo || 'welcome'} message that:
- Is warm, professional, and personal
- References specific client context when relevant
- Shows understanding of their business
- Includes a clear call-to-action
- Is concise (3-4 paragraphs max)
- In Spanish, using natural conversational tone

# Format Template
Subject: [Compelling subject line]

[Greeting with personalization]

[Main content - 2-3 sentences about their work/achievements]

[Call to action or next steps]

[Professional sign-off with sender name and title]`

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
