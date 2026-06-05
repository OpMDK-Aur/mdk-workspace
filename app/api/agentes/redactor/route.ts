import { createClient } from '@/lib/supabase/server'
import { consumeStream, convertToModelMessages, streamText, type UIMessage } from 'ai'

export const maxDuration = 60

// Helper to fetch metrics from internal APIs
async function fetchAccountMetrics(
  platform: 'meta' | 'google',
  accountId: string,
  baseUrl: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number; impressions: number; clicks: number } | null> {
  try {
    // Build date params - use custom period if provided, otherwise last_7d
    const dateParams = periodo?.start && periodo?.end
      ? `start_date=${periodo.start}&end_date=${periodo.end}`
      : 'date_range=last_7d'
    
    const endpoint = platform === 'meta' 
      ? `${baseUrl}/api/ads/meta?account_id=${accountId}&${dateParams}`
      : `${baseUrl}/api/ads/google?customer_id=${accountId}&${dateParams}`
    
    const response = await fetch(endpoint)
    if (!response.ok) return null
    
    const data = await response.json()
    return {
      spend: data.totals?.spend ?? 0,
      leads: data.totals?.leads ?? 0,
      cpl: data.totals?.cpl ?? 0,
      impressions: data.totals?.impressions ?? 0,
      clicks: data.totals?.clicks ?? 0,
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
    const { clientId, tipo, cuentas, periodo } = await req.json()

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

    // Get tasks completed/resolved for this client during the period
    const tareasQuery = supabase
      .from('tareas')
      .select('titulo, descripcion, estado, fecha_completada, created_at')
      .in('estado', ['completada', 'resuelto'])
      .order('fecha_completada', { ascending: false })
    
    // Filter by client (can be in cliente_id or cliente_ids array)
    // We'll fetch all and filter in JS since Supabase doesn't support OR with contains
    const { data: allTareas } = await tareasQuery

    // Filter tasks that belong to this client
    const tareas = allTareas?.filter(t => {
      // Check if task was completed in the selected period
      const completedDate = t.fecha_completada || t.created_at
      if (periodo?.start && periodo?.end && completedDate) {
        const taskDate = completedDate.split('T')[0]
        if (taskDate < periodo.start || taskDate > periodo.end) {
          return false
        }
      }
      return true
    }).slice(0, 10) || []

    // Also get tasks specifically for this client
    const { data: clientTareas } = await supabase
      .from('tareas')
      .select('titulo, descripcion, estado, fecha_completada, created_at')
      .or(`cliente_id.eq.${clientId},cliente_ids.cs.{${clientId}}`)
      .in('estado', ['completada', 'resuelto'])
      .order('fecha_completada', { ascending: false })
      .limit(10)

    // Filter by period
    const tareasDelPeriodo = clientTareas?.filter(t => {
      const completedDate = t.fecha_completada || t.created_at
      if (periodo?.start && periodo?.end && completedDate) {
        const taskDate = completedDate.split('T')[0]
        return taskDate >= periodo.start && taskDate <= periodo.end
      }
      return true
    }) || []

    console.log('[v0] Tareas del periodo:', { count: tareasDelPeriodo.length, periodo })

    // Build base URL for internal API calls
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXTAUTH_URL || 'http://localhost:3000'

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
    
    console.log('[v0] Ad accounts found:', { 
      metaPlural: client.meta_ads_account_ids, 
      metaSingular: client.meta_ads_account_id,
      googlePlural: client.google_ads_customer_ids,
      googleSingular: client.google_ads_customer_id,
      selectedCuentas 
    })
    
    // Fetch Meta accounts metrics (check plural first, then singular as fallback)
    const metaAccounts = client.meta_ads_account_ids?.length 
      ? client.meta_ads_account_ids 
      : client.meta_ads_account_id 
        ? [client.meta_ads_account_id]
        : []
    console.log('[v0] Meta accounts to fetch:', metaAccounts)
    for (const accountId of metaAccounts) {
      if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
        console.log('[v0] Fetching Meta metrics for:', accountId)
        const metrics = await fetchAccountMetrics('meta', accountId, baseUrl, periodo)
        console.log('[v0] Meta metrics result:', metrics)
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
    const googleAccounts = client.google_ads_customer_ids?.length
      ? client.google_ads_customer_ids
      : client.google_ads_customer_id
        ? [client.google_ads_customer_id]
        : []
    console.log('[v0] Google accounts to fetch:', googleAccounts)
    for (const accountId of googleAccounts) {
      if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
        console.log('[v0] Fetching Google metrics for:', accountId)
        const metrics = await fetchAccountMetrics('google', accountId, baseUrl, periodo)
        console.log('[v0] Google metrics result:', metrics)
        if (metrics) {
          metricsByAccount.push({
            account: accountId,
            platform: 'Google Ads',
            ...metrics
          })
        }
      }
    }

    console.log('[v0] Total metrics collected:', metricsByAccount.length)

    // Build context
    const clienteMemoriaText = memoria?.map(m => `- ${m.contenido}`).join('\n') || 'Sin historial'
    
    // Build tasks text from completed tasks in the period
    const tareasText = tareasDelPeriodo.length > 0
      ? tareasDelPeriodo.map(t => `- ${t.titulo}${t.descripcion ? `: ${t.descripcion.substring(0, 100)}` : ''}`).join('\n')
      : 'Sin tareas registradas en este periodo'
    
    // Build metrics text from real account data
    let metricasText = 'Sin metricas disponibles'
    if (metricsByAccount.length > 0) {
      const totalSpend = metricsByAccount.reduce((sum, m) => sum + m.spend, 0)
      const totalLeads = metricsByAccount.reduce((sum, m) => sum + m.leads, 0)
      const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0
      const totalImpressions = metricsByAccount.reduce((sum, m) => sum + m.impressions, 0)
      const totalClicks = metricsByAccount.reduce((sum, m) => sum + m.clicks, 0)

      metricasText = `RESUMEN GLOBAL (últimos 7 días):
- Inversión total: $${totalSpend.toFixed(2)}
- Leads/Conversiones totales: ${totalLeads}
- CPL promedio: $${totalCpl.toFixed(2)}
- Impresiones: ${totalImpressions.toLocaleString()}
- Clics: ${totalClicks.toLocaleString()}

DESGLOSE POR CUENTA:
${metricsByAccount.map(m => 
  `• ${m.platform} (${m.account}): $${m.spend.toFixed(2)} invertido, ${m.leads} leads, CPL: $${m.cpl.toFixed(2)}`
).join('\n')}`
    }

    // Format period for display
    const periodoTexto = periodo?.start && periodo?.end 
      ? `${periodo.start} al ${periodo.end}`
      : 'últimos 7 días'

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

    const result = streamText({
      model: 'openai/gpt-4o-mini',
      system: systemPrompt,
      messages: modelMessages,
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

    return result.toUIMessageStreamResponse({
      originalMessages: userMessage,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Error in redactor agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
