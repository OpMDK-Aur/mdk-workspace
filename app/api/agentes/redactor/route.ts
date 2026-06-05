import { createClient } from '@/lib/supabase/server'
import { streamText } from 'ai'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { clientId, tipo, cuentas } = await req.json()

    // Get agent config
    const { data: agentConfig } = await supabase
      .from('agentes_config')
      .select('*')
      .eq('slug', 'redactor')
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
      .limit(5)

    // Get recent metrics (last 7 days would require metricas_ads with date filtering)
    // For now, get latest metrics
    const { data: metricas } = await supabase
      .from('metricas_ads')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)

    // Build context
    const clienteMemoriaText = memoria?.map(m => `- ${m.contenido}`).join('\n') || 'Sin historial'
    const metricasText = metricas?.[0] 
      ? `Inversion: $${metricas[0].inversion || 0}, Leads: ${metricas[0].conversiones || 0}, CPL: $${metricas[0].cpl || 0}`
      : 'Sin metricas disponibles'

    const tipoMensaje = tipo === 'inicio' ? 'inicio de semana' : 'cierre de semana'
    const cuentasText = cuentas?.length > 0 
      ? `Cuentas seleccionadas: ${cuentas.join(', ')}`
      : 'Sin cuentas seleccionadas'

    const systemPrompt = `${agentConfig.system_prompt}

CONTEXTO:
- Cliente: ${client.nombre_del_negocio}
- Tipo de mensaje: ${tipoMensaje}
- ${cuentasText}

HISTORIAL DEL CLIENTE:
${clienteMemoriaText}

METRICAS RECIENTES:
${metricasText}

Genera un mensaje de WhatsApp para ${tipoMensaje}. Maximo ${(agentConfig.parametros as any)?.max_palabras || 300} palabras.
`

    const result = streamText({
      model: 'anthropic/claude-opus-4-20250514',
      system: systemPrompt,
      messages: [{ role: 'user', content: `Genera el mensaje de ${tipoMensaje} para ${client.nombre_del_negocio}` }],
      abortSignal: req.signal,
    })

    // Log execution
    supabase.from('agentes_log').insert({
      agente: 'redactor',
      ejecutado_por: user.id,
      cliente_id: clientId,
      clientes_auditados: 1,
      estado: 'ok',
    }).then(() => {})

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Error in redactor agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
