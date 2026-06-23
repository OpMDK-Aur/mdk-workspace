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

    console.log('[redactor] Request received:', { clientId, cuentasCount: cuentas?.length, periodo })

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

    // Fetch real metrics from advertising platforms
    let metaSpend = 0
    let metaLeads = 0
    let googleSpend = 0
    let googleLeads = 0

    const startDate = periodo?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = periodo?.end || new Date().toISOString().split('T')[0]

    console.log('[redactor] Fetching real metrics:', { clientId, cuentasCount: cuentas?.length, cuentas, startDate, endDate })

    // Fetch Meta metrics for selected accounts
    const metaAccessToken = process.env.META_ADS_ACCESS_TOKEN
    console.log('[redactor] Meta token available:', !!metaAccessToken)
    
    if (metaAccessToken && cuentas && cuentas.length > 0) {
      for (const accountId of cuentas) {
        // Meta accounts are numeric or start with 'act_'
        const isMetaAccount = accountId.startsWith('act_') || /^\d+$/.test(accountId)
        console.log('[redactor] Checking account:', { accountId, isMetaAccount, startsWithAct: accountId.startsWith('act_'), isNumeric: /^\d+$/.test(accountId) })
        
        if (isMetaAccount) {
          console.log('[redactor] Fetching Meta metrics for:', accountId)
          try {
            const metaMetrics = await fetchMetaMetrics(accountId, metaAccessToken, { start: startDate, end: endDate })
            console.log('[redactor] Meta fetch result for', accountId, ':', metaMetrics)
            if (metaMetrics) {
              metaSpend += metaMetrics.spend || 0
              metaLeads += metaMetrics.leads || 0
              console.log('[redactor] Added Meta metrics:', metaMetrics)
            }
          } catch (error) {
            console.log('[redactor] Meta fetch error for', accountId, ':', error)
          }
        }
      }
    } else {
      console.log('[redactor] Skipping Meta - token:', !!metaAccessToken, 'cuentas:', cuentas)
    }

    // Fetch Google metrics for selected accounts
    try {
      const googleTokenData = await getGoogleAdsAccessToken()
      const googleAccessToken = googleTokenData?.accessToken
      const googleDeveloperToken = getGoogleAdsDeveloperToken()
      const googleLoginCustomerId = getGoogleAdsLoginCustomerId()

      console.log('[redactor] Google tokens available:', { accessToken: !!googleAccessToken, developerToken: !!googleDeveloperToken, loginCustomerId: !!googleLoginCustomerId })

      if (googleAccessToken && googleDeveloperToken && googleLoginCustomerId && cuentas && cuentas.length > 0) {
        for (const customerId of cuentas) {
          // Google accounts typically contain dashes (formatted as 123-456-7890)
          const isGoogleAccount = !customerId.startsWith('act_') && (customerId.includes('-') || /^\d+-\d+-\d+$/.test(customerId))
          console.log('[redactor] Checking account:', { customerId, isGoogleAccount, hasDash: customerId.includes('-') })
          
          if (isGoogleAccount) {
            console.log('[redactor] Fetching Google metrics for:', customerId)
            try {
              const googleMetrics = await fetchGoogleMetrics(customerId, googleAccessToken, googleDeveloperToken, googleLoginCustomerId, { start: startDate, end: endDate })
              console.log('[redactor] Google fetch result for', customerId, ':', googleMetrics)
              if (googleMetrics) {
                googleSpend += googleMetrics.spend || 0
                googleLeads += googleMetrics.leads || 0
                console.log('[redactor] Added Google metrics:', googleMetrics)
              }
            } catch (error) {
              console.log('[redactor] Google fetch error for', customerId, ':', error)
            }
          }
        }
      } else {
        console.log('[redactor] Skipping Google - tokens:', { accessToken: !!googleAccessToken, developerToken: !!googleDeveloperToken, loginCustomerId: !!googleLoginCustomerId, cuentas })
      }
    } catch (error) {
      console.log('[redactor] Google initialization error:', error)
    }

    const totalSpend = metaSpend + googleSpend
    const totalLeads = metaLeads + googleLeads
    const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0

    console.log('[redactor] Final metrics:', { metaSpend, metaLeads, googleSpend, googleLeads, totalSpend, totalLeads, totalCpl })

    // Format period
    const periodText = periodo?.start && periodo?.end 
      ? `${periodo.start} al ${periodo.end}`
      : 'Últimos 7 días'

    // Extract task titles for context
    const tasksText = tasks && tasks.length > 0
      ? tasks.slice(0, 3).map(t => t.titulo).join(', ')
      : 'optimizaciones generales'

    // Build system prompt - always use the strategic template with metrics
    const metricsSection = `CLIENTE: ${client.nombre_del_negocio}
PERÍODO: ${periodText}

MÉTRICAS REALES - META ADS:
- Inversión: $${metaSpend.toFixed(2)}
- Leads: ${metaLeads}
- CPL: $${metaLeads > 0 ? (metaSpend / metaLeads).toFixed(2) : '0.00'}

MÉTRICAS REALES - GOOGLE ADS:
- Inversión: $${googleSpend.toFixed(2)}
- Leads: ${googleLeads}
- CPL: $${googleLeads > 0 ? (googleSpend / googleLeads).toFixed(2) : '0.00'}

TOTAL COMBINADO:
- Inversión Total: $${totalSpend.toFixed(2)}
- Leads Total: ${totalLeads}
- CPL Promedio: $${totalCpl.toFixed(2)}`

    const systemPrompt = `Eres un redactor profesional de una agencia digital. Tu trabajo es generar un mensaje estratégico siguiendo EXACTAMENTE esta plantilla.

${metricsSection}

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
