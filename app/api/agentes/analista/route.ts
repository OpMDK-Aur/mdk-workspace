import { consumeStream, convertToModelMessages, streamText, UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { messages, clientId, month, year }: {
      messages: UIMessage[]
      clientId: string
      month: number
      year: number
    } = await req.json()

    // Get agent config
    const { data: agentConfig } = await supabase
      .from('agentes_config')
      .select('*')
      .eq('slug', 'analista')
      .single()

    if (!agentConfig) {
      return new Response('Agent not found', { status: 404 })
    }

    // Get client data
    const { data: client } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clientId)
      .single()

    if (!client) {
      return new Response('Client not found', { status: 404 })
    }

    // Get client memoria
    const { data: memoria } = await supabase
      .from('cliente_memoria')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Get metrics for the period
    const { data: metricas } = await supabase
      .from('metricas_ads')
      .select('*')
      .eq('cliente_id', clientId)
      .eq('mes', month)
      .eq('anio', year)

    const clienteMemoriaText = memoria?.map((m: { contenido: string }) => `- ${m.contenido}`).join('\n') || 'Sin historial'
    const metricasText = metricas?.length
      ? JSON.stringify(metricas, null, 2)
      : 'Sin métricas disponibles para este período'

    const systemPrompt = `${agentConfig.system_prompt}

CONTEXTO DEL CLIENTE:
- Nombre: ${client.nombre_del_negocio}
- Plan: ${client.plan || 'No definido'}
- Período: ${month}/${year}

HISTORIAL DEL CLIENTE:
${clienteMemoriaText}

MÉTRICAS DEL PERÍODO:
${metricasText}
`

    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model: 'anthropic/claude-opus-4.6',
      system: systemPrompt,
      messages: modelMessages,
      abortSignal: req.signal,
    })

    // Log async
    supabase.from('agentes_log').insert({
      agente: 'analista',
      ejecutado_por: user.id,
      cliente_id: clientId,
      clientes_auditados: 1,
      estado: 'ok',
    }).then(() => {})

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Error in analista agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
