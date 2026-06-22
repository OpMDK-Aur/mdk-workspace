import { createClient } from '@/lib/supabase/server'
import { consumeStream, convertToModelMessages, streamText, type UIMessage } from 'ai'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

export const maxDuration = 60

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const GOOGLE_ADS_API_VERSION = 'v23'

// Helper to fetch Meta metrics directly from Graph API
async function fetchMetaMetrics(
  accountId: string,
  accessToken: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number; impressions: number; clicks: number } | null> {
  try {
    // Build date params
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startDate = periodo?.start || sevenDaysAgo.toISOString().split('T')[0]
    const endDate = periodo?.end || today.toISOString().split('T')[0]
    
    const timeRange = JSON.stringify({ since: startDate, until: endDate })
    const fields = 'impressions,clicks,spend,actions'
    
    const cleanAccountId = accountId.replace('act_', '')
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${cleanAccountId}/insights?access_token=${accessToken}&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=account`
    
    const response = await fetch(url)
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[v0] Meta API error:', response.status, errorText)
      return null
    }
    
    const data = await response.json()
    
    if (!data.data || data.data.length === 0) {
      return { spend: 0, leads: 0, cpl: 0, impressions: 0, clicks: 0 }
    }
    
    const row = data.data[0]
    const impressions = parseInt(row.impressions || '0', 10)
    const clicks = parseInt(row.clicks || '0', 10)
    const spend = parseFloat(row.spend || '0')
    
    // Extract leads from actions
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
    
    return { spend, leads, cpl, impressions, clicks }
  } catch (error) {
    console.error('[v0] Error fetching Meta metrics:', error)
    return null
  }
}

// Helper to fetch Google Ads metrics directly
async function fetchGoogleMetrics(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number; impressions: number; clicks: number } | null> {
  try {
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startDate = periodo?.start || sevenDaysAgo.toISOString().split('T')[0]
    const endDate = periodo?.end || today.toISOString().split('T')[0]
    
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
    
    const response = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[v0] Google Ads API error:', response.status, errorText.slice(0, 300))
      return null
    }
    
    const data = await response.json()
    
    if (!data.results || data.results.length === 0) {
      return { spend: 0, leads: 0, cpl: 0, impressions: 0, clicks: 0 }
    }
    
    // Aggregate across all returned rows (one per day)
    let impressions = 0
    let clicks = 0
    let costMicros = 0
    let conversions = 0
    for (const result of data.results) {
      const m = result.metrics || {}
      impressions += parseInt(m.impressions || '0', 10)
      clicks += parseInt(m.clicks || '0', 10)
      costMicros += parseInt(m.costMicros || m.cost_micros || '0', 10)
      conversions += parseFloat(m.conversions || '0')
    }
    const spend = costMicros / 1000000
    const leads = Math.round(conversions)
    const cpl = leads > 0 ? spend / leads : 0
    
    return { spend, leads, cpl, impressions, clicks }
  } catch (error) {
    console.error('[v0] Error fetching Google metrics:', error)
    return null
  }
}

export async function POST(req: Request) {
  try {
    const { clientId, tipo, cuentas, periodo } = await req.json()
    
    // Initialize Supabase client
    const supabase = createClient()
    
    // Get agent config
    const { data: agentConfig } = await supabase
      .from('agentes_config')
      .select('*')
      .eq('slug', 'redactor')
      .single()

    if (!agentConfig) {
      return new Response('Agent not found', { status: 404 })
    }

    // Get client data with ad account IDs (both singular and plural fields)
    const { data: client } = await supabase
      .from('clientes')
      .select('*, meta_ads_account_id, google_ads_customer_id, meta_ads_account_ids, google_ads_customer_ids')
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

    // Get tasks (completed, resolved, or in progress) for this client during the period
    const { data: clientTareas } = await supabase
      .from('tareas')
      .select('id, titulo, descripcion, estado, fecha_completada, created_at, cliente_id, cliente_ids')
      .in('estado', ['completada', 'resuelto', 'en_progreso', 'en progress'])
      .order('fecha_completada', { ascending: false })
      .limit(30)

    // Filter tasks that belong to this client
    const tareasDelCliente = clientTareas?.filter(t => {
      if (t.cliente_id === clientId) return true
      // Check if client ID is in the cliente_ids array
      if (t.cliente_ids && Array.isArray(t.cliente_ids) && t.cliente_ids.includes(clientId)) {
        return true
      }
      return false
    }) || []

    // Further filter by period
    const tareasDelPeriodo = tareasDelCliente.filter(t => {
      const completedDate = t.fecha_completada || t.created_at
      if (periodo?.start && periodo?.end && completedDate) {
        const taskDate = completedDate.split('T')[0]
        return taskDate >= periodo.start && taskDate <= periodo.end
      }
      return true
    }).slice(0, 15)

    // Get comments for the tasks to include context
    const tareasIds = tareasDelPeriodo.map(t => t.id)
    let comentariosMap: Record<string, any[]> = {}
    
    if (tareasIds.length > 0) {
      const { data: comentarios } = await supabase
        .from('comentarios_tareas')
        .select('tarea_id, contenido, autor_nombre, created_at')
        .in('tarea_id', tareasIds)
        .order('created_at', { ascending: false })
        .limit(100)
      
      if (comentarios) {
        comentariosMap = comentarios.reduce((acc, c) => {
          if (!acc[c.tarea_id]) {
            acc[c.tarea_id] = []
          }
          acc[c.tarea_id].push(c)
          return acc
        }, {} as Record<string, any[]>)
      }
    }

    // Get access tokens for direct API calls (same approach as the Analista agent)
    // Meta: from environment variable
    const metaAccessToken = process.env.META_ADS_ACCESS_TOKEN
    // Google: centralized helper that refreshes the token and reads from DB/env
    const { accessToken: googleAccessToken } = await getGoogleAdsAccessToken()
    const googleDeveloperToken = getGoogleAdsDeveloperToken()
    const googleLoginCustomerId = getGoogleAdsLoginCustomerId()

    // Fetch metrics for selected accounts
    const metricsByAccount: Array<{
      account: string
      platform: string
      spend: number
      leads: number
      cpl: number
      impressions: number
      clicks: number
    }> = []

    // Determine which accounts to fetch based on selection
    const selectedCuentas = cuentas && cuentas.length > 0 ? cuentas : []
    
    // Fetch Meta accounts metrics (check plural first, then singular as fallback)
    const metaAccounts = (client.meta_ads_account_ids && Array.isArray(client.meta_ads_account_ids) && client.meta_ads_account_ids.length > 0)
      ? client.meta_ads_account_ids 
      : client.meta_ads_account_id 
        ? [client.meta_ads_account_id]
        : []
    
    if (metaAccessToken && metaAccounts.length > 0) {
      for (const accountId of metaAccounts) {
        // If cuentas are selected, only fetch those. Otherwise fetch all
        if (selectedCuentas.length > 0 && !selectedCuentas.includes(accountId)) {
          continue
        }
        const metrics = await fetchMetaMetrics(accountId, metaAccessToken, periodo)
        if (metrics) {
          metricsByAccount.push({
            account: accountId,
            platform: 'Meta Ads',
            ...metrics
          })
        }
      }
    }

    // Fetch Google accounts metrics (check plural first, then singular as fallback)
    const googleAccounts = (client.google_ads_customer_ids && Array.isArray(client.google_ads_customer_ids) && client.google_ads_customer_ids.length > 0)
      ? client.google_ads_customer_ids
      : client.google_ads_customer_id
        ? [client.google_ads_customer_id]
        : []
    
    if (googleAccessToken && googleDeveloperToken && googleAccounts.length > 0) {
      for (const accountId of googleAccounts) {
        // If cuentas are selected, only fetch those. Otherwise fetch all
        if (selectedCuentas.length > 0 && !selectedCuentas.includes(accountId)) {
          continue
        }
        const metrics = await fetchGoogleMetrics(accountId, googleAccessToken, googleDeveloperToken, googleLoginCustomerId, periodo)
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
    
    // Build tasks text from completed tasks in the period, including comments
    const tareasText = tareasDelPeriodo.length > 0
      ? tareasDelPeriodo.map(t => {
          let taskText = `- **${t.titulo}**${t.descripcion ? `: ${t.descripcion.substring(0, 100)}` : ''}`
          const comments = comentariosMap[t.id]
          if (comments && comments.length > 0) {
            // Include first 2 most relevant comments
            const firstComments = comments.slice(0, 2).map(c => {
              const cleanContent = c.contenido.split('|||ATTACHMENTS|||')[0].trim()
              return `  • ${c.autor_nombre}: ${cleanContent.substring(0, 80)}`
            }).join('\n')
            taskText += `\n${firstComments}`
          }
          return taskText
        }).join('\n')
      : 'Sin tareas registradas en este periodo'
    
    // Format period for display
    const periodoTexto = periodo?.start && periodo?.end 
      ? `${periodo.start} al ${periodo.end}`
      : 'últimos 7 días'

    // Build metrics text from real account data
    let metricasText = 'Sin métricas disponibles en este período'
    if (metricsByAccount.length > 0) {
      const totalSpend = metricsByAccount.reduce((sum, m) => sum + m.spend, 0)
      const totalLeads = metricsByAccount.reduce((sum, m) => sum + m.leads, 0)
      const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0
      const totalImpressions = metricsByAccount.reduce((sum, m) => sum + m.impressions, 0)
      const totalClicks = metricsByAccount.reduce((sum, m) => sum + m.clicks, 0)

      // Only show detailed metrics if there's actual data
      if (totalSpend > 0 || totalLeads > 0 || totalImpressions > 0 || totalClicks > 0) {
        metricasText = `RESUMEN GLOBAL (${periodoTexto}):
- Inversión total: $${totalSpend.toFixed(2)}
- Leads/Conversiones totales: ${totalLeads}
- CPL promedio: $${totalCpl.toFixed(2)}
- Impresiones: ${totalImpressions.toLocaleString()}
- Clics: ${totalClicks.toLocaleString()}

DESGLOSE POR CUENTA:
${metricsByAccount.map(m => 
  `• ${m.platform} (${m.account}): $${m.spend.toFixed(2)} invertido, ${m.leads} leads, CPL: $${m.cpl.toFixed(2)}`
).join('\n')}`
      } else {
        metricasText = `Cuentas conectadas en período (${periodoTexto}): ${metricsByAccount.map(m => `${m.platform} (${m.account})`).join(', ')}\nSin datos de gasto o conversiones registrados.`
      }
    }

    const tipoMensaje = tipo === 'inicio' ? 'inicio de semana' : 'cierre de semana'
    const cuentasText = metricsByAccount.length > 0 
      ? `Cuentas analizadas: ${metricsByAccount.map(m => `${m.platform} (${m.account})`).join(', ')}`
      : 'Sin cuentas publicitarias configuradas'

    // Determine plan type for template selection
    const planCliente = client.plan || 'Esencial'
    const isEstrategico = planCliente === 'Estratégico'

    // Templates EXACTOS según tipo de mensaje y plan
    const templateInicioEstrategico = `
GENERA EL SIGUIENTE MENSAJE DE LUNES PARA PLAN ESTRATÉGICO:

¡Hola [Nombre del contacto principal]! 👋 Buen lunes.

Desde el equipo de Operaciones de **MDK** te compartimos los hitos clave en los que vamos a estar trabajando en tu cuenta esta semana:

🎯 **Foco principal:** [Ej: Optimización de campañas post-informe de cierre / Lanzamiento de la nueva segmentación]

✅ **Checklist de la semana:**
— [Item 1: acción concreta]
— [Item 2: seguimiento o ajuste técnico]
— [Item 3: preparación de reporte o análisis]

🚀 **Objetivo:** [Resultado esperado. Ej: Recuperar el CPL a los niveles de la semana 2 del mes anterior.]

REGLAS:
- Reemplaza [Nombre del contacto principal] con el nombre real del cliente
- El foco principal debe estar basado en el contexto e historial del cliente
- Incluir entre 2 y 4 items concretos en el checklist basados en lo que realmente se va a trabajar
- El objetivo debe estar vinculado a las métricas reales proporcionadas
- NO usar los ejemplos textuales, adaptarlos al contexto real
- Máximo 150 palabras`

    const templateInicioEsencial = `
GENERA EL SIGUIENTE MENSAJE DE LUNES PARA PLAN ESENCIAL:

¡Hola [Nombre del contacto principal]! 👋 Buen lunes.

Esta semana en tu cuenta vamos a estar trabajando en:

🎯 [Una sola línea con el foco de la semana. Ej: Optimización de campañas y revisión de trackeo.]

🚀 Objetivo: [Una sola línea. Ej: Mantener el CPL dentro del rango acordado.]

Cualquier consulta, acá estamos. 💪

REGLAS:
- Reemplaza [Nombre del contacto principal] con el nombre real
- Mensaje MUY corto y directo
- Solo UNA línea para foco y UNA para objetivo
- NO agregar checklist ni más items
- Máximo 60 palabras totales`

    const templateCierreEstrategico = `
GENERA EL SIGUIENTE MENSAJE DE CIERRE DE SEMANA PARA PLAN ESTRATÉGICO:

¡Hola **[Nombre del contacto]**! 👋 Cerramos la semana en **MDK** con los avances y métricas clave de tu cuenta:

✅ **Hitos Completados:**
- **Logro 1:** [Ej: Campaña de X lanzada con éxito]
- **Logro 2:** [Ej: Ajuste técnico de la plataforma finalizado]

📊 **Métricas de Gestión (Corte al viernes):**
- **Inversión:** $[valor] 
- **Leads:** [cantidad] ([variación] vs. semana pasada)
- **CPL:** $[valor]

🔜 **Próxima semana:** [Una línea con el foco de la siguiente semana]

REGLAS:
- Usa las métricas REALES proporcionadas
- Los hitos deben reflejar el trabajo real realizado según el historial
- Incluir comparativa vs semana anterior si hay datos disponibles
- Máximo 180 palabras`

    const templateCierreEsencial = `
GENERA EL SIGUIENTE MENSAJE DE CIERRE DE SEMANA PARA PLAN ESENCIAL:

¡Hola [Nombre del contacto]! 👋 Cerramos la semana con tu cuenta al día.

✅ Lo que hicimos: [Una sola línea. Ej: Optimizamos las campañas de búsqueda y ajustamos el presupuesto diario.]

📊 Número de la semana: [Un solo KPI relevante. Ej: CPL esta semana: $XX — estable vs semana anterior.]

⏭️ La semana que viene: [Una sola acción. Ej: Arrancamos con los nuevos creativos aprobados.]

¡Buen finde! 🙌

REGLAS:
- Usa las métricas REALES proporcionadas
- Mensaje MUY corto
- Solo UNA línea para cada sección
- Máximo 80 palabras totales`

    const templateToUse = tipo === 'inicio' 
      ? (isEstrategico ? templateInicioEstrategico : templateInicioEsencial)
      : (isEstrategico ? templateCierreEstrategico : templateCierreEsencial)

    const systemPrompt = `${agentConfig.system_prompt}

CONTEXTO DEL CLIENTE:
- Cliente: ${client.nombre_del_negocio}
- Plan: ${planCliente}
- Tipo de mensaje: ${tipoMensaje}
- Periodo de métricas: ${periodoTexto}
- ${cuentasText}

HISTORIAL DEL CLIENTE:
${clienteMemoriaText}

TAREAS COMPLETADAS EN EL PERIODO (${periodoTexto}):
${tareasText}

METRICAS DE CUENTAS PUBLICITARIAS (${periodoTexto}):
${metricasText}

${templateToUse}

IMPORTANTE: 
- Genera el mensaje siguiendo EXACTAMENTE la estructura del template
- Usa los datos reales del cliente, las tareas completadas y las métricas proporcionadas
- Los "Hitos Completados" deben basarse en las TAREAS COMPLETADAS listadas arriba
- NO incluyas las reglas ni instrucciones en el mensaje final
- Reemplaza [Nombre del contacto] con el nombre real del cliente
`

    const userMessage: UIMessage[] = [{ 
      id: crypto.randomUUID(),
      role: 'user', 
      content: `Genera el mensaje de ${tipoMensaje} para ${client.nombre_del_negocio}`,
      parts: [{ type: 'text', text: `Genera el mensaje de ${tipoMensaje} para ${client.nombre_del_negocio}` }]
    }]
    const modelMessages = await convertToModelMessages(userMessage)

    const result = await streamText({
      model: 'openai/gpt-4o-mini',
      system: systemPrompt,
      messages: modelMessages,
      abortSignal: req.signal,
    })

    // Log execution (non-blocking)
    supabase.from('agentes_log').insert({
      agente: 'redactor',
      cliente_id: clientId,
      estado: 'ok',
    }).catch(err => console.error('[v0] Error logging agent execution:', err))

    return result.toUIMessageStreamResponse({
      originalMessages: userMessage,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[v0] Error in redactor agent:', errorMessage, error)
    return new Response(JSON.stringify({ error: errorMessage }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
