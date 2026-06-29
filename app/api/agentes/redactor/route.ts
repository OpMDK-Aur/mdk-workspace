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
    if (row.actions && Array.isArray(row.actions)) {
      // Try different lead-related action types that Meta might report
      const leadAction = row.actions.find((a: { action_type: string; value: string }) => 
        a.action_type === 'lead' || 
        a.action_type === 'onsite_conversion.lead_grouped' ||
        a.action_type === 'onsite_conversion' ||
        a.action_type === 'purchase' ||
        a.action_type.includes('lead') ||
        a.action_type.includes('conversion')
      )
      if (leadAction) {
        leads = parseInt(leadAction.value || '0', 10)
      }
    }
    
    console.log('[redactor] Meta lead search:', { accountId, hasActions: !!row.actions, allActions: row.actions?.map((a: any) => a.action_type), foundLeads: leads })
    
    const cpl = leads > 0 ? spend / leads : 0
    return { spend, leads, cpl }
  } catch (error) {
    return null
  }
}

// Helper to fetch Meta Ads metrics by campaign
async function fetchMetaCampaignMetrics(
  accountId: string,
  accessToken: string,
  periodo?: { start: string; end: string }
): Promise<Array<{ campaign_name: string; spend: number; leads: number; cpl: number }> | null> {
  try {
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startDate = periodo?.start || sevenDaysAgo.toISOString().split('T')[0]
    const endDate = periodo?.end || today.toISOString().split('T')[0]
    
    const timeRange = JSON.stringify({ since: startDate, until: endDate })
    const fields = 'campaign_name,impressions,clicks,spend,actions'
    
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId.replace('act_', '')}/insights?access_token=${accessToken}&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign`
    
    console.log('[redactor] Fetching Meta campaigns from:', url.substring(0, 100) + '...')
    
    const response = await fetch(url)
    console.log('[redactor] Meta campaign response status:', response.status)
    
    if (!response.ok) {
      console.log('[redactor] Meta campaign error response:', await response.text())
      return null
    }
    
    const data = await response.json()
    console.log('[redactor] Meta campaign data received:', data.data?.length || 0, 'campaigns')
    
    if (!data.data || data.data.length === 0) return []
    
    return data.data.map((row: any) => {
      const spend = parseFloat(row.spend || '0')
      let leads = 0
      
      if (row.actions && Array.isArray(row.actions)) {
        const leadAction = row.actions.find((a: { action_type: string; value: string }) => 
          a.action_type === 'lead' || 
          a.action_type === 'onsite_conversion.lead_grouped' ||
          a.action_type === 'onsite_conversion' ||
          a.action_type === 'purchase' ||
          a.action_type.includes('lead') ||
          a.action_type.includes('conversion')
        )
        if (leadAction) leads = parseInt(leadAction.value || '0', 10)
      }
      
      const cpl = leads > 0 ? spend / leads : 0
      return {
        campaign_name: row.campaign_name || 'Sin nombre',
        spend,
        leads,
        cpl
      }
    })
  } catch (error) {
    console.log('[redactor] Meta campaign fetch error:', error)
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
        metrics.conversions,
        metrics.conversions_value,
        metrics.all_conversions,
        metrics.all_conversions_value
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
    let allConversions = 0
    
    for (const result of data.results) {
      const m = result.metrics || {}
      costMicros += parseInt(m.costMicros || m.cost_micros || '0', 10)
      
      // Try to get conversions from different fields
      const conv = parseFloat(m.conversions || '0')
      const allConv = parseFloat(m.all_conversions || m.allConversions || '0')
      
      // Use whichever is larger (conversions or allConversions)
      conversions += conv
      allConversions += allConv
    }
    
    const spend = costMicros / 1000000
    // Use conversions if available, otherwise use allConversions
    const leads = Math.round(conversions > 0 ? conversions : allConversions)
    const cpl = leads > 0 ? spend / leads : 0
    
    console.log('[redactor] Google conversion search:', { customerId, conversions, allConversions, selectedLeads: leads, spend })
    
    return { spend, leads, cpl }
  } catch (error) {
    return null
  }
}

// Helper to fetch Google Ads metrics by campaign
async function fetchGoogleCampaignMetrics(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  periodo?: { start: string; end: string }
): Promise<Array<{ campaign_name: string; spend: number; leads: number; cpl: number }> | null> {
  try {
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startDate = periodo?.start || sevenDaysAgo.toISOString().split('T')[0]
    const endDate = periodo?.end || today.toISOString().split('T')[0]
    
    const cleanCustomerId = customerId.replace(/-/g, '')
    
    const query = `
      SELECT 
        campaign.name,
        metrics.cost_micros,
        metrics.conversions,
        metrics.all_conversions
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY metrics.cost_micros DESC
    `
    
    console.log('[redactor] Fetching Google campaigns for customer:', customerId)
    
    const body = {
      query,
      validateOnly: false
    }
    
    const response = await fetch(`https://googleads.googleapis.com/v17/customers/${cleanCustomerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    console.log('[redactor] Google campaign response status:', response.status)
    
    if (!response.ok) {
      console.log('[redactor] Google campaign error response:', await response.text())
      return null
    }
    
    const text = await response.text()
    const lines = text.trim().split('\n')
    
    const campaigns = lines
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter((item) => item !== null && item.results?.length > 0)
      .map((item: any) => {
        const results = item.results || []
        let totalCost = 0
        let totalConversions = 0
        let totalAllConversions = 0
        let campaignName = 'Sin nombre'
        
        for (const result of results) {
          const m = result.metrics || {}
          totalCost += parseInt(m.costMicros || m.cost_micros || '0', 10)
          totalConversions += parseFloat(m.conversions || '0')
          totalAllConversions += parseFloat(m.all_conversions || m.allConversions || '0')
          campaignName = result.campaign?.name || campaignName
        }
        
        const spend = totalCost / 1000000
        const leads = Math.round(totalConversions > 0 ? totalConversions : totalAllConversions)
        const cpl = leads > 0 ? spend / leads : 0
        
        return { campaign_name: campaignName, spend, leads, cpl }
      })
    
    return campaigns.length > 0 ? campaigns : null
  } catch (error) {
    console.log('[redactor] Google campaign fetch error:', error)
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    let { clientId, tipo, cuentas, periodo } = body

    console.log('[redactor] Raw request:', { clientId, cuentasRaw: cuentas, tipoRaw: typeof cuentas, periodo })

    // Parse cuentas - they may come as comma-separated strings in each array element
    let parsedCuentas: string[] = []
    if (cuentas && Array.isArray(cuentas)) {
      for (const cuenta of cuentas) {
        console.log('[redactor] Processing cuenta:', { cuenta, type: typeof cuenta })
        if (typeof cuenta === 'string') {
          // Split by comma and trim each ID
          const ids = cuenta.split(',').map((id: string) => id.trim()).filter((id: string) => id)
          console.log('[redactor] Split string cuenta into:', ids)
          parsedCuentas.push(...ids)
        } else if (typeof cuenta === 'number') {
          parsedCuentas.push(String(cuenta))
        }
      }
    }
    cuentas = parsedCuentas

    console.log('[redactor] Request received:', { clientId, cuentasCount: cuentas?.length, cuentas, periodo })

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
    let metaCampaigns: Array<{ campaign_name: string; spend: number; leads: number; cpl: number }> = []
    let googleCampaigns: Array<{ campaign_name: string; spend: number; leads: number; cpl: number }> = []

    const startDate = periodo?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = periodo?.end || new Date().toISOString().split('T')[0]

    console.log('[redactor] Fetching real metrics:', { clientId, cuentasCount: cuentas?.length, cuentas, startDate, endDate })

    // Fetch Meta metrics for selected accounts
    const metaAccessToken = process.env.META_ADS_ACCESS_TOKEN
    console.log('[redactor] Meta token available:', !!metaAccessToken)
    console.log('[redactor] Processing Meta accounts:', { cuentasCount: cuentas?.length, cuentas })
    
    if (metaAccessToken && cuentas && cuentas.length > 0) {
      for (const accountId of cuentas) {
        const trimmedId = (accountId || '').trim()
        if (!trimmedId) continue
        
        console.log('[redactor] Checking account:', { accountId: trimmedId, startsWithAct: trimmedId.startsWith('act_'), isNumeric: /^\d+$/.test(trimmedId), hasHyphen: trimmedId.includes('-') })
        
        // Meta accounts are numeric, start with 'act_', or are all digits
        // Google accounts have dashes or are formatted like 123-456-7890
        const isMetaAccount = trimmedId.startsWith('act_') || /^\d+$/.test(trimmedId)
        const isGoogleAccount = trimmedId.includes('-') || /^\d+-\d+-\d+$/.test(trimmedId)
        
        console.log('[redactor] Account classification:', { isMetaAccount, isGoogleAccount })
        
        // Try Meta first if it looks like a Meta account
        if (isMetaAccount) {
          try {
            console.log('[redactor] Fetching Meta metrics for:', trimmedId)
            const metaMetrics = await fetchMetaMetrics(trimmedId, metaAccessToken, { start: startDate, end: endDate })
            console.log('[redactor] Got Meta metrics:', metaMetrics)
            if (metaMetrics) {
              metaSpend += metaMetrics.spend || 0
              metaLeads += metaMetrics.leads || 0
            }
            
            // Also fetch campaign-level metrics
            const metaCamps = await fetchMetaCampaignMetrics(trimmedId, metaAccessToken, { start: startDate, end: endDate })
            if (metaCamps && metaCamps.length > 0) {
              metaCampaigns.push(...metaCamps)
            }
          } catch (error) {
            console.log('[redactor] Meta fetch error for', trimmedId, ':', error)
          }
        }
      }
    }

    // Fetch Google metrics for selected accounts
    try {
      const googleTokenData = await getGoogleAdsAccessToken()
      const googleAccessToken = googleTokenData?.accessToken
      const googleDeveloperToken = getGoogleAdsDeveloperToken()
      const googleLoginCustomerId = getGoogleAdsLoginCustomerId()

      console.log('[redactor] Google credentials available:', { hasToken: !!googleAccessToken, hasDeveloper: !!googleDeveloperToken, hasLoginCustomerId: !!googleLoginCustomerId })

      if (googleAccessToken && googleDeveloperToken && googleLoginCustomerId && cuentas && cuentas.length > 0) {
        for (const customerId of cuentas) {
          const trimmedId = (customerId || '').trim()
          if (!trimmedId) continue
          
          console.log('[redactor] Checking Google account:', { customerId: trimmedId, startsWithAct: trimmedId.startsWith('act_'), hasHyphen: trimmedId.includes('-'), isFormatted: /^\d+-\d+-\d+$/.test(trimmedId) })
          
          // Google accounts typically contain dashes (formatted as 123-456-7890) OR are just dash-separated digits
          const isGoogleAccount = !trimmedId.startsWith('act_') && (trimmedId.includes('-') || /^\d+-\d+-\d+$/.test(trimmedId) || /^\d+$/.test(trimmedId))
          
          console.log('[redactor] Is Google account?', isGoogleAccount)
          
          if (isGoogleAccount) {
            try {
              console.log('[redactor] Fetching Google metrics for:', trimmedId)
              const googleMetrics = await fetchGoogleMetrics(trimmedId, googleAccessToken, googleDeveloperToken, googleLoginCustomerId, { start: startDate, end: endDate })
              console.log('[redactor] Got Google metrics:', googleMetrics)
              if (googleMetrics) {
                googleSpend += googleMetrics.spend || 0
                googleLeads += googleMetrics.leads || 0
              }
              
              // Also fetch campaign-level metrics
              const googleCamps = await fetchGoogleCampaignMetrics(trimmedId, googleAccessToken, googleDeveloperToken, googleLoginCustomerId, { start: startDate, end: endDate })
              if (googleCamps && googleCamps.length > 0) {
                googleCampaigns.push(...googleCamps)
              }
            } catch (error) {
              console.log('[redactor] Google fetch error for', trimmedId, ':', error)
            }
          }
        }
      }
    } catch (error) {
      console.log('[redactor] Google initialization error:', error)
    }

    const totalSpend = metaSpend + googleSpend
    const totalLeads = metaLeads + googleLeads
    const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0

    console.log('[redactor] Final metrics:', { metaSpend, metaLeads, googleSpend, googleLeads, totalSpend, totalLeads, totalCpl, metaCampaigns: metaCampaigns.length, googleCampaigns: googleCampaigns.length })
    console.log('[redactor] Meta campaigns:', JSON.stringify(metaCampaigns, null, 2))
    console.log('[redactor] Google campaigns:', JSON.stringify(googleCampaigns, null, 2))

    // Format period
    const periodText = periodo?.start && periodo?.end 
      ? `${periodo.start} al ${periodo.end}`
      : 'Últimos 7 días'

    // Extract task titles for context
    const tasksText = tasks && tasks.length > 0
      ? tasks.slice(0, 3).map(t => t.titulo).join(', ')
      : 'optimizaciones generales'

    // Build system prompt - always use the strategic template with metrics
    const metaCampaignBreakdown = metaCampaigns.length > 0
      ? '\n\nDETALLE DE CAMPAÑAS - META ADS:\n' + metaCampaigns
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 5)
          .map(c => `• ${c.campaign_name}: Inversión $${c.spend.toFixed(2)}, Leads ${c.leads}, CPL $${c.cpl.toFixed(2)}`)
          .join('\n')
      : ''

    const googleCampaignBreakdown = googleCampaigns.length > 0
      ? '\n\nDETALLE DE CAMPAÑAS - GOOGLE ADS:\n' + googleCampaigns
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 5)
          .map(c => `• ${c.campaign_name}: Inversión $${c.spend.toFixed(2)}, Leads ${c.leads}, CPL $${c.cpl.toFixed(2)}`)
          .join('\n')
      : ''

    const metricsSection = `CLIENTE: ${client.nombre_del_negocio}
PERÍODO: ${periodText}

MÉTRICAS REALES - META ADS:
- Inversión: $${metaSpend.toFixed(2)}
- Leads: ${metaLeads}
- CPL: $${metaLeads > 0 ? (metaSpend / metaLeads).toFixed(2) : '0.00'}${metaCampaignBreakdown}

MÉTRICAS REALES - GOOGLE ADS:
- Inversión: $${googleSpend.toFixed(2)}
- Leads: ${googleLeads}
- CPL: $${googleLeads > 0 ? (googleSpend / googleLeads).toFixed(2) : '0.00'}${googleCampaignBreakdown}

TOTAL COMBINADO:
- Inversión Total: $${totalSpend.toFixed(2)}
- Leads Total: ${totalLeads}
- CPL Promedio: $${totalCpl.toFixed(2)}`

    const systemPrompt = `Eres un redactor profesional de una agencia digital. Tu trabajo es generar ÚNICAMENTE el mensaje final para el cliente, sin incluir ninguna instrucción ni nota interna.

DATOS DEL CLIENTE Y MÉTRICAS (usar como referencia, NO copiar literal):
${metricsSection}

TAREAS RECIENTES: ${tasksText}

REGLAS INTERNAS (NO incluir en el mensaje final):
- Reemplaza [Nombre] con ${client.nombre_del_negocio}
- Las métricas DEBEN ser exactas: Inversión $${totalSpend.toFixed(2)}, Leads ${totalLeads}, CPL $${totalCpl.toFixed(2)}
- INCLUYE SIEMPRE el desglose de campañas
- Si hay datos de Meta Ads y Google Ads, muéstralos con el formato: • Nombre Campaña: Inversión $X.XX, Leads Y, CPL $Z.ZZ
- Mantén TODOS los emojis
- Usa contexto real del cliente para los items
- NO incluyas las palabras "IMPORTANTE", "REGLAS", ni ninguna nota interna en tu respuesta
- Devuelve SOLO el mensaje, comenzando con "¡Hola" y terminando con el objetivo

El mensaje final debe seguir EXACTAMENTE esta estructura (rellena los corchetes con contenido real y elimina los corchetes):

¡Hola ${client.nombre_del_negocio}! 👋 Buen lunes.
Desde el equipo de Operaciones de MDK te compartimos los hitos clave en los que vamos a estar trabajando en tu cuenta esta semana:
🎯 Foco principal: [Contexto específico del cliente basado en sus tareas/métricas]
✅ Checklist de la semana: — [Item 1] — [Item 2] — [Item 3]
📊 Métricas de esta semana (${periodText}):
— Inversión: $${totalSpend.toFixed(2)}
— Leads: ${totalLeads}
— CPL: $${totalCpl.toFixed(2)}

📈 Desglose por Plataforma y Campaña:${metaCampaignBreakdown}${googleCampaignBreakdown}

🚀 Objetivo: [Objetivo realista basado en las métricas actuales]`

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
