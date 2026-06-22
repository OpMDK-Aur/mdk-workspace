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

    // Get completed tasks for this client
    const { data: tasks } = await supabase
      .from('tareas')
      .select('id, titulo, descripcion, estado')
      .in('estado', ['completada', 'resuelto', 'en_progreso'])
      .limit(15)

    // Build system prompt with available data
    const tasksText = tasks && tasks.length > 0
      ? tasks.map(t => `- ${t.titulo}${t.descripcion ? ': ' + t.descripcion.substring(0, 80) : ''}`).join('\n')
      : 'Sin tareas registradas'

    const systemPrompt = `Eres un asistente de redacción para la agencia digital. Tu rol es generar mensajes profesionales y contextualizados.

Información del cliente:
- Nombre: ${client.nombre_del_negocio || 'No especificado'}
- Industria: ${client.industria || 'No especificada'}

Tareas completadas recientemente:
${tasksText}

Genera un mensaje de ${tipo || 'bienvenida'} que sea:
- Profesional y amigable
- Personalizado para el cliente
- Basado en el contexto de sus tareas recientes
- Conciso pero informativo`

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
