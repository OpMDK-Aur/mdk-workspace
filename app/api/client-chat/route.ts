import {
  consumeStream,
  convertToModelMessages,
  streamText,
  UIMessage,
} from 'ai'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

interface ClientChatRequest {
  messages: UIMessage[]
  clientId: string
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('[v0] Client chat received:', JSON.stringify(body, null, 2))
    const { messages, clientId }: ClientChatRequest = body

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 1. Fetch client data
    const { data: client } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clientId)
      .single()

    if (!client) {
      return new Response('Client not found', { status: 404 })
    }

    // 2. Fetch client memoria
    const { data: memoria } = await supabase
      .from('cliente_memoria')
      .select('contenido')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 3. Fetch client tasks
    const { data: tasks } = await supabase
      .from('tareas')
      .select('id, titulo, estado, prioridad, fecha_vencimiento, descripcion')
      .eq('cliente_id', clientId)
      .order('fecha_vencimiento', { ascending: true })
      .limit(20)

    // 4. Fetch recent comments
    const { data: comments } = await supabase
      .from('comentarios_clientes')
      .select('contenido, autor, creado_en')
      .eq('cliente_id', clientId)
      .order('creado_en', { ascending: false })
      .limit(10)

    // 5. Get ads data from cache if available
    let googleAdsData = null
    let metaAdsData = null
    
    try {
      if (client.google_ads_customer_id) {
        const cleanId = client.google_ads_customer_id.replace(/-/g, '')
        const { data: gCache } = await supabase
          .from('ads_cache')
          .select('payload')
          .eq('platform', 'google')
          .eq('account_id', cleanId)
          .gt('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle()
        googleAdsData = gCache?.payload
      }

      if (client.meta_ads_account_id) {
        const cleanId = client.meta_ads_account_id.replace(/^act_/, '')
        const { data: mCache } = await supabase
          .from('ads_cache')
          .select('payload')
          .eq('platform', 'meta')
          .eq('account_id', cleanId)
          .gt('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle()
        metaAdsData = mCache?.payload
      }
    } catch {
      // Cache errors are non-fatal
    }

    // Build context with all client properties
    const clientInfo = `
## Información del Cliente
- ID: ${client.id}
- Nombre del Negocio: ${client.nombre_del_negocio || client.business_name || 'N/A'}
- Plan: ${client.plan || 'N/A'}
- Estado/Semaforo: ${client.semaforo_id || client.status || 'N/A'}
- Etapa: ${client.etapa || 'N/A'}

### Contacto
- Nombre: ${client.nombre || ''} ${client.apellido || ''}
- Teléfono: ${client.telefono || 'N/A'}
- Email: ${client.email || 'N/A'}

### Fechas Importantes
- Fecha de Venta: ${client.fecha_venta || 'N/A'}
- Fecha de Activación: ${client.fecha_activacion || 'N/A'}
- Fecha de Inicio de Trabajo: ${client.fecha_inicio_trabajo || 'N/A'}
- Fecha de Baja: ${client.fecha_baja || 'N/A'}
- Creado: ${client.created_at || 'N/A'}
- Actualizado: ${client.updated_at || 'N/A'}

### Fees y Financiero
- Fee MDK: $${client.fee_mdk?.toLocaleString() || 'N/A'}
- Fee Aurelia: $${client.fee_aurelia?.toLocaleString() || 'N/A'}
- NPS Score: ${client.nps_score || 'N/A'}

### Plataformas Publicitarias
- Google Ads Customer ID: ${client.google_ads_customer_id || 'No configurado'}
- Meta Ads Account ID: ${client.meta_ads_account_id || 'No configurado'}

### CRM
- Tipo de CRM: ${client.crm_type || client.crm_tipo || 'N/A'}
- URL CRM: ${client.crm_url || 'N/A'}
- GHL Location ID: ${client.ghl_location_id || 'N/A'}

### Equipo Asignado
- Project Manager ID: ${client.project_manager_id || 'No asignado'}
- Account Manager ID: ${client.account_manager_id || 'No asignado'}

### Servicios Contratados
${client.servicio_id && client.servicio_id.length > 0 ? client.servicio_id.map((id: string) => `- ${id}`).join('\n') : '- Sin servicios asignados'}

### Semáforo por Unidad de Negocio
${client.semaforo_unidades ? Object.entries(client.semaforo_unidades).map(([unidad, color]) => `- ${unidad}: ${color}`).join('\n') : '- Sin semáforos por unidad'}

### Landings
${client.landings && client.landings.length > 0 ? client.landings.map((l: { nombre: string; url: string; tipo: string }) => `- ${l.nombre} (${l.tipo}): ${l.url}`).join('\n') : '- Sin landings registradas'}

### Discord
- Canal: ${client.discord_channel_name || 'N/A'}
- Canal ID: ${client.discord_channel_id || 'N/A'}

### Notion
- Notion ID: ${client.notion_id || 'N/A'}
`

    const memoriaContent = memoria?.contenido
      ? `\n## Memoria del Cliente\n${memoria.contenido}\n`
      : '\n## Memoria del Cliente\nNo hay memoria registrada.\n'

    const tasksContent = tasks && tasks.length > 0
      ? `\n## Tareas del Cliente (${tasks.length} tareas)\n${tasks.map(t =>
          `- [${t.estado}] ${t.titulo} (Prioridad: ${t.prioridad || 'normal'}${t.fecha_vencimiento ? `, Vence: ${t.fecha_vencimiento}` : ''})`
        ).join('\n')}\n`
      : '\n## Tareas\nNo hay tareas registradas.\n'

    const commentsContent = comments && comments.length > 0
      ? `\n## Comentarios Recientes (últimos ${comments.length})\n${comments.map(c =>
          `- [${new Date(c.creado_en).toLocaleDateString('es-AR')}] ${c.autor}: ${c.contenido.slice(0, 200)}${c.contenido.length > 200 ? '...' : ''}`
        ).join('\n')}\n`
      : '\n## Comentarios\nNo hay comentarios registrados.\n'

    const googleAdsContent = googleAdsData
      ? `\n## Datos de Google Ads (últimos 30 días)
- Inversión Total: $${googleAdsData.totals?.spend?.toLocaleString() || '0'}
- Impresiones: ${googleAdsData.totals?.impressions?.toLocaleString() || '0'}
- Clicks: ${googleAdsData.totals?.clicks?.toLocaleString() || '0'}
- CTR: ${googleAdsData.totals?.ctr?.toFixed(2) || '0'}%
- CPC Promedio: $${googleAdsData.totals?.cpc?.toFixed(2) || '0'}
- Conversiones: ${googleAdsData.totals?.leads || '0'}
- CPL: $${googleAdsData.totals?.cpl?.toFixed(2) || '0'}
`
      : '\n## Google Ads\nNo hay datos de Google Ads disponibles.\n'

    const metaAdsContent = metaAdsData
      ? `\n## Datos de Meta Ads (últimos 30 días)
- Inversión Total: $${metaAdsData.totals?.spend?.toLocaleString() || '0'}
- Impresiones: ${metaAdsData.totals?.impressions?.toLocaleString() || '0'}
- Clicks: ${metaAdsData.totals?.clicks?.toLocaleString() || '0'}
- CTR: ${metaAdsData.totals?.ctr?.toFixed(2) || '0'}%
- CPC Promedio: $${metaAdsData.totals?.cpc?.toFixed(2) || '0'}
- Leads: ${metaAdsData.totals?.leads || '0'}
- CPL: $${metaAdsData.totals?.cpl?.toFixed(2) || '0'}
`
      : '\n## Meta Ads\nNo hay datos de Meta Ads disponibles.\n'

    const systemPrompt = `Eres un asistente de IA integrado en la ficha de un cliente de una agencia de marketing digital.

Tu propósito es ayudar al equipo a:
1. Responder preguntas sobre el cliente basándote en la información disponible
2. Analizar el rendimiento de las campañas de Google Ads y Meta Ads
3. Sugerir acciones basadas en las tareas pendientes y el contexto
4. Buscar y filtrar información en los comentarios y tareas
5. Resumir la situación actual del cliente

IMPORTANTE:
- Responde siempre en español
- Sé conciso pero completo
- Si te piden buscar algo específico en comentarios o tareas, hazlo con precisión
- Si no tienes la información, indícalo claramente
- Usa formato Markdown para mejor legibilidad

---
${clientInfo}
${memoriaContent}
${tasksContent}
${commentsContent}
${googleAdsContent}
${metaAdsContent}
---

Fecha actual: ${new Date().toLocaleDateString('es-AR', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}`

    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model: 'anthropic/claude-sonnet-4-20250514',
      system: systemPrompt,
      messages: modelMessages,
      abortSignal: req.signal,
    })

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('[v0] Client chat error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
