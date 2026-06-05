import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { consumeStream, convertToModelMessages, streamText, type UIMessage } from 'ai'

export const maxDuration = 120

// Helper to fetch metrics from internal APIs
async function fetchAccountMetrics(
  platform: 'meta' | 'google',
  accountId: string,
  baseUrl: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number } | null> {
  try {
    const dateParams = periodo?.start && periodo?.end
      ? `start_date=${periodo.start}&end_date=${periodo.end}`
      : 'date_range=last_30d'
    
    const endpoint = platform === 'meta' 
      ? `${baseUrl}/api/ads/meta?account_id=${accountId}&${dateParams}`
      : `${baseUrl}/api/ads/google?customer_id=${accountId}&${dateParams}`
    
    const response = await fetch(endpoint)
    if (!response.ok) return null
    
    const data = await response.json()
    const impressions = data.totals?.impressions ?? 0
    const clicks = data.totals?.clicks ?? 0
    
    return {
      spend: data.totals?.spend ?? 0,
      leads: data.totals?.leads ?? 0,
      cpl: data.totals?.cpl ?? 0,
      impressions,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    }
  } catch (error) {
    console.error(`Error fetching ${platform} metrics for ${accountId}:`, error)
    return null
  }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { clientId, periodo, cuentas } = await req.json()

    // Get agent config
    const { data: agentConfig } = await supabase
      .from('agentes_config')
      .select('*')
      .eq('slug', 'analista')
      .single()

    if (!agentConfig) {
      return new Response('Agent not found', { status: 404 })
    }

    // Get client data with ad account IDs
    const { data: client } = await supabase
      .from('clientes')
      .select('*, meta_ads_account_id, google_ads_customer_id, meta_ads_account_ids, google_ads_customer_ids')
      .eq('id', clientId)
      .single()

    if (!client) {
      return new Response('Client not found', { status: 404 })
    }

    // Get client memoria for context
    const { data: memoria } = await supabase
      .from('cliente_memoria')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Get tasks completed for this client during the period
    const { data: clientTareas } = await supabase
      .from('tareas')
      .select('titulo, descripcion, estado, fecha_completada, created_at')
      .or(`cliente_id.eq.${clientId},cliente_ids.cs.{${clientId}}`)
      .in('estado', ['completada', 'resuelto'])
      .order('fecha_completada', { ascending: false })
      .limit(20)

    // Filter by period
    const tareasDelPeriodo = clientTareas?.filter(t => {
      const completedDate = t.fecha_completada || t.created_at
      if (periodo?.start && periodo?.end && completedDate) {
        const taskDate = completedDate.split('T')[0]
        return taskDate >= periodo.start && taskDate <= periodo.end
      }
      return true
    }) || []

    // Build base URL for internal API calls
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Fetch metrics for accounts
    const metricsByAccount: Array<{
      account: string
      platform: string
      spend: number
      leads: number
      cpl: number
      impressions: number
      clicks: number
      ctr: number
    }> = []

    const selectedCuentas = cuentas && cuentas.length > 0 ? cuentas : []
    
    // Fetch Meta accounts metrics
    const metaAccounts = client.meta_ads_account_ids?.length 
      ? client.meta_ads_account_ids 
      : client.meta_ads_account_id 
        ? [client.meta_ads_account_id]
        : []
    
    for (const accountId of metaAccounts) {
      if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
        const metrics = await fetchAccountMetrics('meta', accountId, baseUrl, periodo)
        if (metrics) {
          metricsByAccount.push({
            account: accountId,
            platform: 'Meta Ads',
            ...metrics
          })
        }
      }
    }

    // Fetch Google accounts metrics
    const googleAccounts = client.google_ads_customer_ids?.length
      ? client.google_ads_customer_ids
      : client.google_ads_customer_id
        ? [client.google_ads_customer_id]
        : []
    
    for (const accountId of googleAccounts) {
      if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
        const metrics = await fetchAccountMetrics('google', accountId, baseUrl, periodo)
        if (metrics) {
          metricsByAccount.push({
            account: accountId,
            platform: 'Google Ads',
            ...metrics
          })
        }
      }
    }

    // Build context
    const clienteMemoriaText = memoria?.map(m => `- ${m.contenido}`).join('\n') || 'Sin historial'
    const tareasText = tareasDelPeriodo.length > 0
      ? tareasDelPeriodo.map(t => `- ${t.titulo}${t.descripcion ? `: ${t.descripcion.substring(0, 100)}` : ''}`).join('\n')
      : 'Sin tareas registradas en este periodo'
    
    // Build metrics text
    let metricasText = 'Sin metricas disponibles'
    if (metricsByAccount.length > 0) {
      const totalSpend = metricsByAccount.reduce((sum, m) => sum + m.spend, 0)
      const totalLeads = metricsByAccount.reduce((sum, m) => sum + m.leads, 0)
      const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0
      const totalImpressions = metricsByAccount.reduce((sum, m) => sum + m.impressions, 0)
      const totalClicks = metricsByAccount.reduce((sum, m) => sum + m.clicks, 0)
      const totalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

      metricasText = `RESUMEN GLOBAL:
- Inversión total: $${totalSpend.toFixed(2)}
- Leads/Conversiones totales: ${totalLeads}
- CPL promedio: $${totalCpl.toFixed(2)}
- Impresiones: ${totalImpressions.toLocaleString()}
- Clics: ${totalClicks.toLocaleString()}
- CTR: ${totalCtr.toFixed(2)}%

DESGLOSE POR CUENTA:
${metricsByAccount.map(m => 
  `• ${m.platform} (${m.account}):
    - Inversión: $${m.spend.toFixed(2)}
    - Leads: ${m.leads}
    - CPL: $${m.cpl.toFixed(2)}
    - Impresiones: ${m.impressions.toLocaleString()}
    - Clics: ${m.clicks.toLocaleString()}
    - CTR: ${m.ctr.toFixed(2)}%`
).join('\n')}`
    }

    const periodoTexto = periodo?.start && periodo?.end 
      ? `${periodo.start} al ${periodo.end}`
      : 'últimos 30 días'

    const systemPrompt = `${agentConfig.system_prompt}

Eres un analista de performance digital experto. Tu rol es analizar las métricas de campañas publicitarias y generar informes detallados con insights accionables.

CONTEXTO DEL CLIENTE:
- Cliente: ${client.nombre_del_negocio}
- Plan: ${client.plan || 'No especificado'}
- Periodo de análisis: ${periodoTexto}

HISTORIAL Y CONTEXTO DEL CLIENTE:
${clienteMemoriaText}

TAREAS REALIZADAS EN EL PERIODO:
${tareasText}

METRICAS DE CUENTAS PUBLICITARIAS:
${metricasText}

INSTRUCCIONES:
1. Analiza las métricas proporcionadas de forma detallada
2. Identifica tendencias, problemas y oportunidades
3. Compara el rendimiento entre cuentas si hay múltiples
4. Genera recomendaciones concretas y accionables
5. El informe debe ser profesional pero fácil de entender
6. Incluye un resumen ejecutivo al inicio
7. Destaca los KPIs más importantes

FORMATO DEL INFORME:
- Usar markdown para estructura
- Incluir emojis relevantes para visualización
- Destacar números importantes en negrita
- Organizar por secciones claras
`

    const userMessage: UIMessage[] = [{ 
      id: crypto.randomUUID(),
      role: 'user', 
      content: `Genera un informe de análisis completo para ${client.nombre_del_negocio} del periodo ${periodoTexto}`,
      parts: [{ type: 'text', text: `Genera un informe de análisis completo para ${client.nombre_del_negocio} del periodo ${periodoTexto}` }]
    }]
    const modelMessages = await convertToModelMessages(userMessage)

    // Use OpenAI directly with GPT-4o-mini
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
      abortSignal: req.signal,
    })

    // Log execution
    supabase.from('agentes_log').insert({
      agente: 'analista',
      ejecutado_por: user.id,
      cliente_id: clientId,
      clientes_auditados: 1,
      estado: 'ok',
    }).then(() => {})

    return result.toUIMessageStreamResponse({
      originalMessages: userMessage,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Error in analista agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
