import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { clientId } = await req.json()

    // Get agent config
    const { data: agentConfig } = await supabase
      .from('agentes_config')
      .select('*')
      .eq('slug', 'revops')
      .single()

    if (!agentConfig) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Get client data with CRM info
    const { data: client } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clientId)
      .single()

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get client memoria
    const { data: memoria } = await supabase
      .from('cliente_memoria')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10)

    const clienteMemoriaText = memoria?.map(m => `- ${m.contenido}`).join('\n') || 'Sin historial'

    const systemPrompt = `${agentConfig.system_prompt}

CONTEXTO DEL CLIENTE:
- Nombre: ${client.nombre_del_negocio}
- CRM Tipo: ${client.crm_tipo || 'No configurado'}
- CRM URL: ${client.crm_url || 'No configurado'}

HISTORIAL DEL CLIENTE:
${clienteMemoriaText}

INSTRUCCIONES:
Analiza el uso del CRM del cliente y genera un checklist de tareas con su estado actual.
Responde UNICAMENTE con un JSON valido con el siguiente formato exacto, sin texto adicional:
{
  "items": [
    { "tarea": "descripcion de la tarea", "realiza": true/false, "nota": "observacion opcional" }
  ]
}
`

    const result = await generateText({
      model: 'anthropic/claude-opus-4.6',
      system: systemPrompt,
      messages: [{ role: 'user', content: `Analiza el uso del CRM para ${client.nombre_del_negocio}` }],
    })

    // Parse the JSON response
    let items = []
    try {
      const parsed = JSON.parse(result.text)
      items = parsed.items || []
    } catch {
      // If parsing fails, create a default response
      items = [
        { tarea: 'Registro de leads en el CRM', realiza: false, nota: 'No se pudo determinar' },
        { tarea: 'Seguimiento de oportunidades', realiza: false, nota: 'No se pudo determinar' },
        { tarea: 'Actualizacion de estados', realiza: false, nota: 'No se pudo determinar' },
      ]
    }

    // Log execution
    await supabase.from('agentes_log').insert({
      agente: 'revops',
      ejecutado_por: user.id,
      cliente_id: clientId,
      clientes_auditados: 1,
      estado: 'ok',
      resultado: { items },
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error in revops agent:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
