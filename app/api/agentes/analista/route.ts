import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export const maxDuration = 120

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'

// Helper to fetch Meta metrics directly from Graph API
async function fetchMetaMetrics(
  accountId: string,
  accessToken: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number } | null> {
  try {
    const today = new Date()
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startDate = periodo?.start || thirtyDaysAgo.toISOString().split('T')[0]
    const endDate = periodo?.end || today.toISOString().split('T')[0]
    
    const timeRange = JSON.stringify({ since: startDate, until: endDate })
    const fields = 'impressions,clicks,spend,actions'
    
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId.replace('act_', '')}/insights?access_token=${accessToken}&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=account`
    
    const response = await fetch(url)
    if (!response.ok) {
      console.error('[v0] Meta API error:', response.status)
      return null
    }
    
    const data = await response.json()
    if (!data.data || data.data.length === 0) {
      return { spend: 0, leads: 0, cpl: 0, impressions: 0, clicks: 0, ctr: 0 }
    }
    
    const row = data.data[0]
    const impressions = parseInt(row.impressions || '0', 10)
    const clicks = parseInt(row.clicks || '0', 10)
    const spend = parseFloat(row.spend || '0')
    
    let leads = 0
    if (row.actions) {
      const leadAction = row.actions.find((a: { action_type: string; value: string }) => 
        a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
      )
      if (leadAction) {
        leads = parseInt(leadAction.value, 10)
      }
    }
    
    const cpl = leads > 0 ? spend / leads : 0
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    
    return { spend, leads, cpl, impressions, clicks, ctr }
  } catch (error) {
    console.error('[v0] Error fetching Meta metrics:', error)
    return null
  }
}

// Helper to fetch Google Ads metrics directly
async function fetchGoogleMetrics(
  customerId: string,
  accessToken: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number } | null> {
  try {
    const today = new Date()
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startDate = (periodo?.start || thirtyDaysAgo.toISOString().split('T')[0])
    const endDate = (periodo?.end || today.toISOString().split('T')[0])
    
    const cleanCustomerId = customerId.replace(/-/g, '')
    
    const query = `
      SELECT 
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `
    
    const response = await fetch(`https://googleads.googleapis.com/v18/customers/${cleanCustomerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
    
    if (!response.ok) {
      console.error('[v0] Google Ads API error:', response.status)
      return null
    }
    
    const data = await response.json()
    if (!data.results || data.results.length === 0) {
      return { spend: 0, leads: 0, cpl: 0, impressions: 0, clicks: 0, ctr: 0 }
    }
    
    const row = data.results[0].metrics || {}
    const impressions = parseInt(row.impressions || '0', 10)
    const clicks = parseInt(row.clicks || '0', 10)
    const spend = (parseInt(row.costMicros || '0', 10) / 1000000)
    const leads = Math.round(parseFloat(row.conversions || '0'))
    const cpl = leads > 0 ? spend / leads : 0
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    
    return { spend, leads, cpl, impressions, clicks, ctr }
  } catch (error) {
    console.error('[v0] Error fetching Google metrics:', error)
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
    const { clientId, periodo, cuentas, messages, month, year } = await req.json()
    
    console.log('[v0] Analista request:', { clientId, month, year, periodo })

    // Calculate period from month/year if not provided directly
    let effectivePeriodo = periodo
    if (!effectivePeriodo && month && year) {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0) // Last day of month
      effectivePeriodo = {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    }

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
      if (effectivePeriodo?.start && effectivePeriodo?.end && completedDate) {
        const taskDate = completedDate.split('T')[0]
        return taskDate >= effectivePeriodo.start && taskDate <= effectivePeriodo.end
      }
      return true
    }) || []

    // Get access tokens from plataformas_tokens for direct API calls
    const { data: metaTokens } = await supabase
      .from('plataformas_tokens')
      .select('access_token')
      .eq('plataforma', 'meta_ads')
      .limit(1)

    const { data: googleTokens } = await supabase
      .from('plataformas_tokens')
      .select('access_token')
      .eq('plataforma', 'google_ads')
      .limit(1)
    
    const metaAccessToken = metaTokens?.[0]?.access_token
    const googleAccessToken = googleTokens?.[0]?.access_token

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
    
    console.log('[v0] Tokens found:', { meta: !!metaAccessToken, google: !!googleAccessToken })
    
    // Fetch Meta accounts metrics
    const metaAccounts = client.meta_ads_account_ids?.length 
      ? client.meta_ads_account_ids 
      : client.meta_ads_account_id 
        ? [client.meta_ads_account_id]
        : []
    
    if (metaAccessToken && metaAccounts.length > 0) {
      for (const accountId of metaAccounts) {
        if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
          const metrics = await fetchMetaMetrics(accountId, metaAccessToken, effectivePeriodo)
          if (metrics) {
            metricsByAccount.push({
              account: accountId,
              platform: 'Meta Ads',
              ...metrics
            })
          }
        }
      }
    }

    // Fetch Google accounts metrics
    const googleAccounts = client.google_ads_customer_ids?.length
      ? client.google_ads_customer_ids
      : client.google_ads_customer_id
        ? [client.google_ads_customer_id]
        : []
    
    if (googleAccessToken && googleAccounts.length > 0) {
      for (const accountId of googleAccounts) {
        if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
          const metrics = await fetchGoogleMetrics(accountId, googleAccessToken, effectivePeriodo)
          if (metrics) {
            metricsByAccount.push({
              account: accountId,
              platform: 'Google Ads',
              ...metrics
            })
          }
        }
      }
    }
    
    console.log('[v0] Total metrics collected:', metricsByAccount.length)

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

    const periodoTexto = effectivePeriodo?.start && effectivePeriodo?.end 
      ? `${effectivePeriodo.start} al ${effectivePeriodo.end}`
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

CAPACIDADES DE VISUALIZACION - OBLIGATORIAS:
Debes generar al menos 2-3 gráficos por informe usando estos bloques especiales.

Para GRÁFICOS de barras, líneas, áreas o pie, usa EXACTAMENTE este formato:

\`\`\`chart
{"type":"bar","title":"Inversión por Plataforma","data":[{"name":"Meta Ads","value":1500},{"name":"Google Ads","value":2300}],"xKey":"name","yKey":"value","color":"#7F77DD"}
\`\`\`

Tipos disponibles: "bar", "line", "area", "pie"

Para generar ARCHIVOS descargables (CSV de datos, reportes):

\`\`\`file
{"name":"metricas-mayo-2026.csv","type":"text/csv","content":"Plataforma,Inversion,Leads,CPL\\nMeta Ads,1500,45,33.33\\nGoogle Ads,2300,62,37.10"}
\`\`\`

REGLAS DE VISUALIZACION:
- SIEMPRE genera un gráfico de barras comparando inversión entre plataformas si hay datos
- SIEMPRE genera un gráfico de pie mostrando distribución de leads por plataforma
- Si hay datos históricos, genera un gráfico de líneas mostrando tendencias
- Al final del informe, SIEMPRE genera un CSV descargable con los datos del periodo
- Los gráficos deben ir INLINE con el texto, no al final
- Usa colores: "#7F77DD" (morado), "#10B981" (verde), "#F59E0B" (amarillo), "#EF4444" (rojo)

ANÁLISIS DE IMÁGENES:
Si el usuario adjunta imágenes (capturas de dashboards, reportes, anuncios), analízalas detalladamente, extrae los datos que puedas ver y úsalos en tu análisis.

FORMATO DEL INFORME:
- Usar markdown para estructura
- Incluir los gráficos DENTRO del contenido, no al final
- Destacar números importantes en **negrita**
- Organizar por secciones claras
- Terminar con un CSV descargable de resumen
`

    // Check if there are image attachments for vision
    const { attachments } = await req.json().catch(() => ({ attachments: [] }))
    const hasImages = attachments?.some((a: { type: string }) => a.type?.startsWith('image/'))
    
    // Build messages - if user sent messages, use them; otherwise create initial request
    const processedMessages = messages?.length > 0 
      ? messages.map((m: { role: string; content: string }, idx: number) => {
          // For the last user message, attach images if present
          if (m.role === 'user' && idx === messages.length - 1 && hasImages) {
            const imageAttachments = attachments.filter((a: { type: string }) => a.type?.startsWith('image/'))
            if (imageAttachments.length > 0) {
              return {
                role: m.role,
                content: [
                  { type: 'text', text: m.content },
                  ...imageAttachments.map((a: { url: string }) => ({
                    type: 'image',
                    image: a.url,
                  }))
                ]
              }
            }
          }
          return { role: m.role, content: m.content }
        })
      : [{
          role: 'user',
          content: `Genera un informe de análisis completo para ${client.nombre_del_negocio} del periodo ${periodoTexto}. Incluye gráficos de visualización y un CSV descargable con los datos.`
        }]

    // Use GPT-4o for vision when images present, otherwise gpt-4o-mini
    const modelId = hasImages ? 'gpt-4o' : 'gpt-4o-mini'

    const result = streamText({
      model: openai(modelId),
      system: systemPrompt,
      messages: processedMessages,
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

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Error in analista agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
