import { streamText, UIMessage, convertToModelMessages, consumeStream } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getCachedAdsData } from '@/lib/ads-cache'

export const maxDuration = 60

interface ClientChatRequest {
  messages: UIMessage[]
  clientId: string
}

export async function POST(req: Request) {
  const { messages, clientId }: ClientChatRequest = await req.json()

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
    .single()

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

  // 5. Get Google Ads data from cache if available
  let googleAdsData = null
  if (client.google_ads_customer_id) {
    const cleanId = client.google_ads_customer_id.replace(/-/g, '')
    googleAdsData = await getCachedAdsData('google', cleanId, 'last_30d')
  }

  // 6. Get Meta Ads data from cache if available
  let metaAdsData = null
  if (client.meta_ads_account_id) {
    const cleanId = client.meta_ads_account_id.replace(/^act_/, '')
    metaAdsData = await getCachedAdsData('meta', cleanId, 'last_30d')
  }

  // Build context
  const clientInfo = `
## Información del Cliente
- Nombre: ${client.nombre || client.business_name || 'N/A'}
- Plan: ${client.plan || 'N/A'}
- Estado: ${client.estado || client.status || 'N/A'}
- Fee MDK: $${client.fee_mdk?.toLocaleString() || 'N/A'}
- Google Ads ID: ${client.google_ads_customer_id || 'No configurado'}
- Meta Ads ID: ${client.meta_ads_account_id || 'No configurado'}
`

  const memoriaContent = memoria?.contenido
    ? `\n## Memoria del Cliente\n${memoria.contenido}\n`
    : ''

  const tasksContent = tasks && tasks.length > 0
    ? `\n## Tareas del Cliente (${tasks.length} tareas)\n${tasks.map(t =>
        `- [${t.estado}] ${t.titulo} (Prioridad: ${t.prioridad || 'normal'}${t.fecha_vencimiento ? `, Vence: ${t.fecha_vencimiento}` : ''})`
      ).join('\n')}\n`
    : '\n## Tareas\nNo hay tareas registradas.\n'

  const commentsContent = comments && comments.length > 0
    ? `\n## Comentarios Recientes (últimos ${comments.length})\n${comments.map(c =>
        `- [${new Date(c.creado_en).toLocaleDateString('es-AR')}] ${c.autor}: ${c.contenido.slice(0, 200)}${c.contenido.length > 200 ? '...' : ''}`
      ).join('\n')}\n`
    : ''

  const googleAdsContent = googleAdsData
    ? `\n## Datos de Google Ads (últimos 30 días)
- Inversión Total: $${googleAdsData.totals?.spend?.toLocaleString() || '0'}
- Impresiones: ${googleAdsData.totals?.impressions?.toLocaleString() || '0'}
- Clicks: ${googleAdsData.totals?.clicks?.toLocaleString() || '0'}
- CTR: ${googleAdsData.totals?.ctr?.toFixed(2) || '0'}%
- CPC Promedio: $${googleAdsData.totals?.cpc?.toFixed(2) || '0'}
- Conversiones: ${googleAdsData.totals?.leads || '0'}
- CPL: $${googleAdsData.totals?.cpl?.toFixed(2) || '0'}
${googleAdsData.campaigns?.length > 0 ? `\nCampañas activas:\n${googleAdsData.campaigns.slice(0, 5).map((c: { name: string; spend: number; leads: number }) =>
  `- ${c.name}: $${c.spend?.toLocaleString() || '0'} invertido, ${c.leads || 0} conversiones`
).join('\n')}` : ''}
`
    : '\n## Google Ads\nNo hay datos de Google Ads disponibles (sin conexión o sin caché).\n'

  const metaAdsContent = metaAdsData
    ? `\n## Datos de Meta Ads (últimos 30 días)
- Inversión Total: $${metaAdsData.totals?.spend?.toLocaleString() || '0'}
- Impresiones: ${metaAdsData.totals?.impressions?.toLocaleString() || '0'}
- Clicks: ${metaAdsData.totals?.clicks?.toLocaleString() || '0'}
- CTR: ${metaAdsData.totals?.ctr?.toFixed(2) || '0'}%
- CPC Promedio: $${metaAdsData.totals?.cpc?.toFixed(2) || '0'}
- Leads: ${metaAdsData.totals?.leads || '0'}
- CPL: $${metaAdsData.totals?.cpl?.toFixed(2) || '0'}
${metaAdsData.campaigns?.length > 0 ? `\nCampañas activas:\n${metaAdsData.campaigns.slice(0, 5).map((c: { name: string; spend: number; leads: number }) =>
  `- ${c.name}: $${c.spend?.toLocaleString() || '0'} invertido, ${c.leads || 0} leads`
).join('\n')}` : ''}
`
    : '\n## Meta Ads\nNo hay datos de Meta Ads disponibles (sin conexión o sin caché).\n'

  const systemPrompt = `Eres un asistente de IA integrado en la ficha de un cliente de una agencia de marketing digital.

Tu propósito es ayudar al equipo a:
1. Responder preguntas sobre el cliente basándote en la información disponible
2. Analizar el rendimiento de las campañas de Google Ads y Meta Ads
3. Sugerir acciones basadas en las tareas pendientes y el contexto
4. Buscar y filtrar información en los comentarios y tareas
5. Resumir la situación actual del cliente

Tienes acceso a:
- Información básica del cliente
- Memoria/notas del cliente
- Tareas asignadas al cliente
- Comentarios recientes del equipo
- Datos de rendimiento de Google Ads y Meta Ads

IMPORTANTE:
- Responde siempre en español
- Sé conciso pero completo
- Si te piden buscar algo específico en comentarios o tareas, hazlo con precisión
- Si no tienes la información, indícalo claramente
- Usa formato Markdown para mejor legibilidad
- Si te preguntan sobre métricas que no tienes, sugiere actualizar los datos

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
}
