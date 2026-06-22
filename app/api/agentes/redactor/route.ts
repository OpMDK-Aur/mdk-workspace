import { createClient } from '@/lib/supabase/server'
import { streamText, type CoreMessage } from 'ai'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

export const maxDuration = 60

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const GOOGLE_ADS_API_VERSION = 'v23'

export async function POST(req: Request) {
  try {
    console.log('[redactor] Starting POST request')
    const body = await req.json()
    const { clientId, tipo, cuentas, periodo } = body
    console.log('[redactor] Params:', { clientId, tipo })

    const supabase = createClient()
    console.log('[redactor] Supabase client created')

    // Get client data
    console.log('[redactor] Fetching client:', clientId)
    const { data: client, error: clientError } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clientId)
      .single()

    console.log('[redactor] Client fetch result:', { clientError, clientName: client?.nombre_del_negocio })

    if (clientError || !client) {
      console.error('[redactor] Client not found')
      return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Get completed tasks for this client
    console.log('[redactor] Fetching tasks')
    const { data: tasks } = await supabase
      .from('tareas')
      .select('id, titulo, descripcion, estado')
      .in('estado', ['completada', 'resuelto', 'en_progreso'])
      .limit(15)
    console.log('[redactor] Tasks fetched:', tasks?.length || 0)

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

    console.log('[redactor] Creating streamText call')
    const result = streamText({
      model: 'openai/gpt-4o-mini',
      system: systemPrompt,
      messages: [userMessage],
    })
    console.log('[redactor] StreamText created, returning response')

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('[redactor] ERROR:', error)
    if (error instanceof Error) {
      console.error('[redactor] Stack:', error.stack)
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message, type: typeof error }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
