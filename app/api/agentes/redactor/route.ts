import { createClient } from '@supabase/supabase-js'
import { streamText, type CoreMessage } from 'ai'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

export const maxDuration = 60

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const GOOGLE_ADS_API_VERSION = 'v23'

// Helper to fetch Meta metrics
async function fetchMetaMetrics(
  accountId: string,
  accessToken: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number } | null> {
  try {
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startDate = periodo?.start || sevenDaysAgo.toISOString().split('T')[0]
    const endDate = periodo?.end || today.toISOString().split('T')[0]
    
    const timeRange = JSON.stringify({ since: startDate, until: endDate })
    const fields = 'impressions,clicks,spend,actions'
    
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId.replace('act_', '')}/insights?access_token=${accessToken}&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=account`
    
    const response = await fetch(url)
    if (!response.ok) return null
    
    const data = await response.json()
    if (!data.data || data.data.length === 0) {
      return { spend: 0, leads: 0, cpl: 0 }
    }
    
    const row = data.data[0]
    const spend = parseFloat(row.spend || '0')
    
    let leads = 0
    if (row.actions) {
      const leadAction = row.actions.find((a: { action_type: string; value: string }) => 
        a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
      )
      if (leadAction) leads = parseInt(leadAction.value, 10)
    }
    
    const cpl = leads > 0 ? spend / leads : 0
    return { spend, leads, cpl }
  } catch (error) {
    return null
  }
}

// Helper to fetch Google Ads metrics
async function fetchGoogleMetrics(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  periodo?: { start: string; end: string }
): Promise<{ spend: number; leads: number; cpl: number } | null> {
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
    
    if (!response.ok) return null
    
    const data = await response.json()
    if (!data.results || data.results.length === 0) {
      return { spend: 0, leads: 0, cpl: 0 }
    }
    
    let costMicros = 0
    let conversions = 0
    for (const result of data.results) {
      const m = result.metrics || {}
      costMicros += parseInt(m.costMicros || m.cost_micros || '0', 10)
      conversions += parseFloat(m.conversions || '0')
    }
    const spend = costMicros / 1000000
    const leads = Math.round(conversions)
    const cpl = leads > 0 ? spend / leads : 0
    
    return { spend, leads, cpl }
  } catch (error) {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { clientId, tipo, cuentas, periodo } = body

    console.log('[redactor] Request received:', { clientId, tipo, cuentasCount: cuentas?.length, periodo })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Get client data
    const { data: client, error: clientError } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }

    // Get completed tasks for this client ONLY
    const { data: tasks } = await supabase
      .from('tareas')
      .select('id, titulo, descripcion, estado')
      .or(`cliente_id.eq.${clientId},cliente_ids.cs.{${clientId}}`)
      .in('estado', ['completada', 'resuelto', 'en_progreso'])
      .limit(10)

    // Fetch metrics from database
    let totalSpend = 0
    let totalLeads = 0
    let totalCpl = 0

    // Try to get metrics from the database first
    const startDate = periodo?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = periodo?.end || new Date().toISOString().split('T')[0]

    console.log('[redactor] Fetching metrics from database:', { clientId, startDate, endDate })
    
    const { data: metricsData } = await supabase
      .from('agentes_metricas')
      .select('*')
      .eq('cliente_id', clientId)
      .gte('fecha', startDate)
      .lte('fecha', endDate)
      .order('fecha', { ascending: false })

    console.log('[redactor] Database metrics found:', metricsData?.length || 0)

    if (metricsData && metricsData.length > 0) {
      // Sum all metrics for the period
      for (const metric of metricsData) {
        totalSpend += parseFloat(metric.gasto_total || metric.inversión || 0)
        totalLeads += parseInt(metric.leads || 0)
      }
    }

    console.log('[redactor] Total metrics collected:', { totalSpend, totalLeads })

    // Calculate CPL
    totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0

    console.log('[redactor] Metrics after calculation:', { totalSpend, totalLeads, totalCpl })

    // Fallback to demo metrics if no real metrics were fetched
    if (totalSpend === 0 && totalLeads === 0) {
      console.log('[redactor] No metrics fetched, using demo values')
      // Demo values for testing
      // totalSpend = 1250.50
      // totalLeads = 45
      // totalCpl = totalSpend / totalLeads
    }

    // Format period
    const periodText = periodo?.start && periodo?.end 
      ? `${periodo.start} al ${periodo.end}`
      : 'Últimos 7 días'

    // Extract task titles for context
    const tasksText = tasks && tasks.length > 0
      ? tasks.slice(0, 3).map(t => t.titulo).join(', ')
      : 'optimizaciones generales'

    // Build system prompt based on message type
    let systemPrompt = ''

    if (tipo === 'inicio_semana_estrategico') {
      systemPrompt = `Eres un redactor profesional de una agencia digital. Tu trabajo es generar un mensaje de inicio de semana siguiendo EXACTAMENTE esta plantilla.

CLIENTE: ${client.nombre_del_negocio}
PERÍODO: ${periodText}
MÉTRICAS REALES:
- Inversión: $${totalSpend.toFixed(2)}
- Leads: ${totalLeads}
- CPL: $${totalCpl.toFixed(2)}

TAREAS RECIENTES: ${tasksText}

Genera el mensaje con EXACTAMENTE esta estructura:

¡Hola [Nombre]! 👋 Buen lunes.
Desde el equipo de Operaciones de MDK te compartimos los hitos clave en los que vamos a estar trabajando en tu cuenta esta semana:
🎯 Foco principal: [Contexto específico del cliente basado en sus tareas/métricas]
✅ Checklist de la semana: — [Item 1] — [Item 2] — [Item 3]
📊 Métricas de esta semana (${periodText}):
— Inversión: $${totalSpend.toFixed(2)}
— Leads: ${totalLeads}
— CPL: $${totalCpl.toFixed(2)}
🚀 Objetivo: [Objetivo realista basado en las métricas actuales]

IMPORTANTE:
- Reemplaza [Nombre] con ${client.nombre_del_negocio}
- Las métricas DEBEN ser exactas: Inversión $${totalSpend.toFixed(2)}, Leads ${totalLeads}, CPL $${totalCpl.toFixed(2)}
- Mantén TODOS los emojis
- Usa contexto real del cliente para los items`
    } else if (tipo === 'inicio_semana_esencial') {
      systemPrompt = `Eres un redactor profesional de una agencia digital. Tu trabajo es generar un mensaje de inicio de semana siguiendo EXACTAMENTE esta plantilla.

CLIENTE: ${client.nombre_del_negocio}
PERÍODO: ${periodText}
MÉTRICAS REALES:
- Inversión: $${totalSpend.toFixed(2)}
- Leads: ${totalLeads}
- CPL: $${totalCpl.toFixed(2)}

TAREAS RECIENTES: ${tasksText}

Genera el mensaje con EXACTAMENTE esta estructura:

¡Hola [Nombre]! 👋 Buen lunes.
Esta semana en tu cuenta vamos a estar trabajando en:
🎯 ${tasksText}
📊 Métricas de esta semana (${periodText}):
— Inversión: $${totalSpend.toFixed(2)}
— Leads: ${totalLeads}
— CPL: $${totalCpl.toFixed(2)}
🚀 Objetivo: Mantener/mejorar los KPIs actuales
Cualquier consulta, acá estamos. 💪

IMPORTANTE:
- Reemplaza [Nombre] con ${client.nombre_del_negocio}
- Las métricas DEBEN ser exactas: Inversión $${totalSpend.toFixed(2)}, Leads ${totalLeads}, CPL $${totalCpl.toFixed(2)}
- Mantén TODOS los emojis
- Una sola línea en cada sección principal`
    } else if (tipo === 'cierre_semana_estrategico') {
      systemPrompt = `Eres un redactor profesional de una agencia digital. Tu trabajo es generar un mensaje de cierre de semana siguiendo EXACTAMENTE esta plantilla.

CLIENTE: ${client.nombre_del_negocio}
PERÍODO: ${periodText}
MÉTRICAS REALES:
- Inversión: $${totalSpend.toFixed(2)}
- Leads: ${totalLeads}
- CPL: $${totalCpl.toFixed(2)}

TAREAS COMPLETADAS: ${tasksText}

Genera el mensaje con EXACTAMENTE esta estructura:

¡Hola [Nombre del Cliente]! 👋 Cerramos la semana en MDK con los avances y métricas clave de tu cuenta:
✅ Hitos Completados:
Logro 1: [Basado en tareas reales del cliente]
Logro 2: [Otro logro relevante]
📊 Métricas de Gestión (${periodText}):
— Inversión: $${totalSpend.toFixed(2)}
— Leads: ${totalLeads}
— CPL: $${totalCpl.toFixed(2)}
💡 Conclusión: [Análisis breve de las métricas]
⏭️ Próximos pasos: [Acciones para la próxima semana]
¡Buen fin de semana para todo el equipo! 🥂

IMPORTANTE:
- Reemplaza [Nombre del Cliente] con ${client.nombre_del_negocio}
- Las métricas DEBEN ser exactas: Inversión $${totalSpend.toFixed(2)}, Leads ${totalLeads}, CPL $${totalCpl.toFixed(2)}
- Mantén TODOS los emojis
- Usa contexto real de tareas del cliente`
    } else if (tipo === 'cierre_semana_esencial') {
      systemPrompt = `Eres un redactor profesional de una agencia digital. Tu trabajo es generar un mensaje de cierre de semana siguiendo EXACTAMENTE esta plantilla.

CLIENTE: ${client.nombre_del_negocio}
PERÍODO: ${periodText}
MÉTRICAS REALES:
- Inversión: $${totalSpend.toFixed(2)}
- Leads: ${totalLeads}
- CPL: $${totalCpl.toFixed(2)}

TAREAS COMPLETADAS: ${tasksText}

Genera el mensaje con EXACTAMENTE esta estructura:

¡Hola [Nombre]! 👋 Cerramos la semana con tu cuenta al día.
✅ Lo que hicimos: ${tasksText}
📊 Números de la semana (${periodText}):
— Inversión: $${totalSpend.toFixed(2)}
— Leads: ${totalLeads}
— CPL: $${totalCpl.toFixed(2)}
⏭️ La semana que viene: [Una sola acción clave]
¡Buen finde! 🙌

IMPORTANTE:
- Reemplaza [Nombre] con ${client.nombre_del_negocio}
- Las métricas DEBEN ser exactas: Inversión $${totalSpend.toFixed(2)}, Leads ${totalLeads}, CPL $${totalCpl.toFixed(2)}
- Mantén TODOS los emojis
- Una sola línea en cada sección`
    }

    const userMessage: CoreMessage = {
      role: 'user',
      content: `Genera el mensaje siguiendo EXACTAMENTE la plantilla. Incluye las métricas reales proporcionadas.`
    }

    const result = streamText({
      model: 'openai/gpt-4o-mini',
      system: systemPrompt,
      messages: [userMessage],
    })

    return result.toTextStreamResponse()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
