import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'

export const maxDuration = 120

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const GOOGLE_ADS_API_VERSION = 'v23'

type DailyPoint = { date: string; spend: number; leads: number; impressions: number; clicks: number }
type CampaignPoint = { name: string; spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number }
type AccountMetrics = {
  spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number
  daily: DailyPoint[]
  campaigns: CampaignPoint[]
}

// Helper to fetch Meta metrics directly from Graph API
async function fetchMetaMetrics(
  accountId: string,
  accessToken: string,
  periodo?: { start: string; end: string }
): Promise<AccountMetrics | null> {
  try {
    const today = new Date()
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startDate = periodo?.start || thirtyDaysAgo.toISOString().split('T')[0]
    const endDate = periodo?.end || today.toISOString().split('T')[0]
    
    const timeRange = JSON.stringify({ since: startDate, until: endDate })
    const fields = 'impressions,clicks,spend,actions'
    
    // time_increment=1 returns one row per day so we can build daily breakdowns
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId.replace('act_', '')}/insights?access_token=${accessToken}&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=account&time_increment=1`
    
    const response = await fetch(url)
    if (!response.ok) {
      console.error('[v0] Meta API error:', response.status)
      return null
    }
    
    const data = await response.json()
    if (!data.data || data.data.length === 0) {
      return { spend: 0, leads: 0, cpl: 0, impressions: 0, clicks: 0, ctr: 0, daily: [], campaigns: [] }
    }
    
    const getLeads = (row: { actions?: Array<{ action_type: string; value: string }> }) => {
      if (!row.actions) return 0
      const leadAction = row.actions.find((a) => 
        a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
      )
      return leadAction ? parseInt(leadAction.value, 10) : 0
    }
    
    let impressions = 0
    let clicks = 0
    let spend = 0
    let leads = 0
    const daily: DailyPoint[] = []
    
    for (const row of data.data) {
      const dImpr = parseInt(row.impressions || '0', 10)
      const dClicks = parseInt(row.clicks || '0', 10)
      const dSpend = parseFloat(row.spend || '0')
      const dLeads = getLeads(row)
      impressions += dImpr
      clicks += dClicks
      spend += dSpend
      leads += dLeads
      daily.push({
        date: row.date_start || row.date_stop || '',
        spend: dSpend,
        leads: dLeads,
        impressions: dImpr,
        clicks: dClicks,
      })
    }
    
    const cpl = leads > 0 ? spend / leads : 0
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    
    // Second call: campaign-level breakdown for the same period
    const campaigns: CampaignPoint[] = []
    try {
      const campUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId.replace('act_', '')}/insights?access_token=${accessToken}&fields=campaign_name,${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&limit=200`
      const campResp = await fetch(campUrl)
      if (campResp.ok) {
        const campData = await campResp.json()
        for (const row of campData.data || []) {
          const cImpr = parseInt(row.impressions || '0', 10)
          const cClicks = parseInt(row.clicks || '0', 10)
          const cSpend = parseFloat(row.spend || '0')
          const cLeads = getLeads(row)
          campaigns.push({
            name: row.campaign_name || 'Sin nombre',
            spend: cSpend,
            leads: cLeads,
            cpl: cLeads > 0 ? cSpend / cLeads : 0,
            impressions: cImpr,
            clicks: cClicks,
            ctr: cImpr > 0 ? (cClicks / cImpr) * 100 : 0,
          })
        }
      }
    } catch (e) {
      console.error('[v0] Error fetching Meta campaigns:', e)
    }
    
    return { spend, leads, cpl, impressions, clicks, ctr, daily, campaigns }
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
): Promise<AccountMetrics | null> {
  try {
    const today = new Date()
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startDate = (periodo?.start || thirtyDaysAgo.toISOString().split('T')[0])
    const endDate = (periodo?.end || today.toISOString().split('T')[0])
    
    const cleanCustomerId = customerId.replace(/-/g, '')
    
    const query = `
      SELECT 
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY segments.date ASC
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
      const errText = await response.text().catch(() => '')
      console.error('[v0] Google Ads API error:', response.status, errText.slice(0, 300))
      return null
    }
    
    const data = await response.json()
    if (!data.results || data.results.length === 0) {
      return { spend: 0, leads: 0, cpl: 0, impressions: 0, clicks: 0, ctr: 0, daily: [], campaigns: [] }
    }
    
    // Each row is one day. Build daily breakdown and totals.
    let impressions = 0
    let clicks = 0
    let costMicros = 0
    let conversions = 0
    const daily: DailyPoint[] = []
    for (const result of data.results) {
      const m = result.metrics || {}
      const seg = result.segments || {}
      const dImpr = parseInt(m.impressions || '0', 10)
      const dClicks = parseInt(m.clicks || '0', 10)
      const dCostMicros = parseInt(m.costMicros || m.cost_micros || '0', 10)
      const dConv = parseFloat(m.conversions || '0')
      impressions += dImpr
      clicks += dClicks
      costMicros += dCostMicros
      conversions += dConv
      daily.push({
        date: seg.date || '',
        spend: dCostMicros / 1000000,
        leads: Math.round(dConv),
        impressions: dImpr,
        clicks: dClicks,
      })
    }
    const spend = costMicros / 1000000
    const leads = Math.round(conversions)
    const cpl = leads > 0 ? spend / leads : 0
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    
    // Second query: campaign-level breakdown for the same period
    const campaigns: CampaignPoint[] = []
    try {
      const campQuery = `
        SELECT 
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM campaign
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      `
      const campResp = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: campQuery }),
      })
      if (campResp.ok) {
        const campData = await campResp.json()
        // Rows are per campaign per day; aggregate by campaign name
        const byCampaign = new Map<string, { spend: number; leads: number; impressions: number; clicks: number }>()
        for (const result of campData.results || []) {
          const m = result.metrics || {}
          const name = result.campaign?.name || 'Sin nombre'
          const entry = byCampaign.get(name) || { spend: 0, leads: 0, impressions: 0, clicks: 0 }
          entry.impressions += parseInt(m.impressions || '0', 10)
          entry.clicks += parseInt(m.clicks || '0', 10)
          entry.spend += parseInt(m.costMicros || m.cost_micros || '0', 10) / 1000000
          entry.leads += parseFloat(m.conversions || '0')
          byCampaign.set(name, entry)
        }
        for (const [name, e] of byCampaign) {
          const cLeads = Math.round(e.leads)
          campaigns.push({
            name,
            spend: e.spend,
            leads: cLeads,
            cpl: cLeads > 0 ? e.spend / cLeads : 0,
            impressions: e.impressions,
            clicks: e.clicks,
            ctr: e.impressions > 0 ? (e.clicks / e.impressions) * 100 : 0,
          })
        }
      } else {
        const errText = await campResp.text().catch(() => '')
        console.error('[v0] Google Ads campaign query error:', campResp.status, errText.slice(0, 300))
      }
    } catch (e) {
      console.error('[v0] Error fetching Google campaigns:', e)
    }
    
    return { spend, leads, cpl, impressions, clicks, ctr, daily, campaigns }
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
    const { clientId, periodo, cuentas, messages, month, year, attachments } = await req.json()
    
    console.log('[v0] Analista request:', { clientId, month, year, periodo, attachmentsCount: attachments?.length || 0 })

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

    // Get access tokens for direct API calls
    // Meta: from environment variable (same as /api/ads/meta)
    const metaAccessToken = process.env.META_ADS_ACCESS_TOKEN
    // Google: use centralized helper that refreshes the token and reads from DB/env
    const { accessToken: googleAccessToken } = await getGoogleAdsAccessToken()
    const googleDeveloperToken = getGoogleAdsDeveloperToken()
    const googleLoginCustomerId = getGoogleAdsLoginCustomerId()

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
    
    console.log('[v0] Tokens found:', { meta: !!metaAccessToken, google: !!googleAccessToken, googleDevToken: !!googleDeveloperToken })
    
    // Fetch Meta accounts metrics
    const metaAccounts = client.meta_ads_account_ids?.length 
      ? client.meta_ads_account_ids 
      : client.meta_ads_account_id 
        ? [client.meta_ads_account_id]
        : []
    
    const metaErrors: string[] = []
    if (metaAccounts.length > 0 && !metaAccessToken) {
      metaErrors.push('Meta Ads: Token de acceso no configurado')
    }
    
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
          } else {
            metaErrors.push(`Meta Ads ${accountId}: No se pudieron obtener métricas (verifica que la cuenta esté activa y tenga datos en el periodo)`)
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
    
    const googleErrors: string[] = []
    if (googleAccounts.length > 0 && !googleAccessToken) {
      googleErrors.push('Google Ads: Token de acceso no configurado')
    }
    if (googleAccounts.length > 0 && !googleDeveloperToken) {
      googleErrors.push('Google Ads: Developer token no configurado')
    }
    
    if (googleAccessToken && googleDeveloperToken && googleAccounts.length > 0) {
      for (const accountId of googleAccounts) {
        if (selectedCuentas.length === 0 || selectedCuentas.includes(accountId)) {
          const metrics = await fetchGoogleMetrics(accountId, googleAccessToken, googleDeveloperToken, googleLoginCustomerId, effectivePeriodo)
          if (metrics) {
            metricsByAccount.push({
              account: accountId,
              platform: 'Google Ads',
              ...metrics
            })
          } else {
            googleErrors.push(`Google Ads ${accountId}: No se pudieron obtener métricas (verifica las credenciales y que la cuenta esté activa)`)
          }
        }
      }
    }
    
    console.log('[v0] Total metrics collected:', metricsByAccount.length)
    console.log('[v0] Meta errors:', metaErrors.length > 0 ? metaErrors : 'none')
    console.log('[v0] Google errors:', googleErrors.length > 0 ? googleErrors : 'none')

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
).join('\n')}

DESGLOSE DIARIO POR CUENTA (datos reales día por día):
${metricsByAccount.map(m => {
  if (!m.daily || m.daily.length === 0) {
    return `• ${m.platform} (${m.account}): sin datos diarios disponibles`
  }
  const rows = m.daily.map(d => 
    `    ${d.date}: ${d.leads} leads | $${d.spend.toFixed(2)} inversión | ${d.impressions.toLocaleString()} impresiones | ${d.clicks.toLocaleString()} clics`
  ).join('\n')
  return `• ${m.platform} (${m.account}):\n${rows}`
}).join('\n')}

DESGLOSE POR CAMPAÑA (datos reales por campaña):
${metricsByAccount.map(m => {
  if (!m.campaigns || m.campaigns.length === 0) {
    return `• ${m.platform} (${m.account}): sin datos de campañas disponibles`
  }
  const rows = m.campaigns
    .sort((a, b) => b.spend - a.spend)
    .map(c => 
      `    "${c.name}": ${c.leads} leads | $${c.spend.toFixed(2)} inversión | CPL $${c.cpl.toFixed(2)} | ${c.impressions.toLocaleString()} impresiones | ${c.clicks.toLocaleString()} clics | CTR ${c.ctr.toFixed(2)}%`
    ).join('\n')
  return `• ${m.platform} (${m.account}):\n${rows}`
}).join('\n')}`
    }

    const periodoTexto = effectivePeriodo?.start && effectivePeriodo?.end 
      ? `${effectivePeriodo.start} al ${effectivePeriodo.end}`
      : 'últimos 30 días'

    // Detect which report template applies based on the client's plan
    const planNormalizado = (client.plan || '').toLowerCase()
    const esEstrategico = planNormalizado.includes('estrat')
    const esEsencial = planNormalizado.includes('esencial')
    const planInforme = esEstrategico ? 'Estratégico' : esEsencial ? 'Esencial' : 'No determinado'

    // Knowledge of MDK's official report structures (PPTX templates) so the
    // agent builds reports matching the right template for the client's plan.
    const guiaInformes = `
ESTRUCTURA OFICIAL DE LOS INFORMES DE CIERRE DE MES (MDK):
Cuando el usuario pida un INFORME o un PDF de cierre de mes, NO inventes la estructura: usá la plantilla oficial que corresponda al plan del cliente. El plan detectado para este cliente es: "${planInforme}" (plan crudo: "${client.plan || 'sin definir'}").

Reglas generales para AMBOS informes:
- Completá cada sección con DATOS REALES del contexto (métricas, tareas, historial). Nunca uses frases genéricas.
- Los tests SIEMPRE deben incluir un resultado cuantitativo (ej. "+20% CTR").
- Tono profesional, directo y orientado al negocio del cliente.
- La sección de CRM/gestión comercial debe tener tono constructivo, basado en datos, nunca acusatoria.
- SI ALGÚN DATO NO ESTÁ DISPONIBLE en el contexto (ej. ventas cerradas, funnel por zona, feedback comercial, capturas de anuncios, datos del CRM, contexto de mercado), NO lo dejes vacío ni lo inventes: PEDÍSELO EXPLÍCITAMENTE al usuario antes de cerrar el informe, listando con claridad qué información necesitás que te provea. Si el usuario pide el informe igual, marcá esos campos como "Dato no provisto" en la slide correspondiente.

▶ PLAN ESENCIAL — "INFORME DE RESULTADOS" (6 slides):
- Portada: cliente, período (mes/año) y responsable.
- 01 Resumen del Período: objetivo de la pauta; conclusión general (2-3 líneas); cumplimiento → leads generados vs objetivo, CPL promedio vs objetivo, % de cumplimiento (logrado / parcial / no logrado).
- 02 Resultados de Campañas: KPIs de encabezado (inversión total, leads, CPL promedio, variación vs período anterior) + tabla por campaña (inversión, leads, CPL, % vs anterior) con fila TOTAL.
- 03 Acciones Realizadas: cambios en campañas, optimizaciones aplicadas, tests ejecutados con resultados.
- 04 Análisis del Funnel (síntesis): leads por pauta ingresados al CRM vs lo reportado por la plataforma, diferencia/coherencia, cuello de botella si aplica, oportunidades detectadas. (El análisis profundo de pipeline es exclusivo del Plan Estratégico.)
- 05 Qué Funcionó / Qué No: piezas/audiencias/formatos con mejor resultado + dato clave y aprendizaje; lo descartado con motivo y datos.
- 06 Plan del Mes Siguiente: qué se ajusta, qué se testea, requerimientos al cliente.

▶ PLAN ESTRATÉGICO — "INFORME ESTRATÉGICO DE RESULTADOS" (11 slides):
- Portada: cliente, período, ejecutivo responsable.
- 01 Resumen Ejecutivo: 4 KPIs (leads, CPL, ventas, inversión), estado de cumplimiento (% del objetivo), objetivo del período, contexto del mes (mercado, estacionalidad, cambios internos del cliente) y conclusión general.
- 02 ¿En qué estuvimos trabajando?: 4 pilares → Estrategia, Operaciones, Testing, Optimización.
- 03 Testing y Optimización Creativa: anuncios testeados con métricas comparativas (CTR, CPL, volumen), formato ganador, top anuncios por campaña y por calidad de venta. Requiere imágenes/capturas de los anuncios (pedilas si no están).
- 04 Performance de Campañas: tabla por plataforma (Meta Ads y Google Ads) con inversión, leads, CPL, CPC, CTR y fila TOTAL.
- 05 Acciones Realizadas: cambios, optimizaciones y tests con resultados cuantitativos.
- 06 Impacto en el Negocio (Funnel completo): tabla del funnel por zona/región con Leads, MQL, Contacto, SQL, Presupuesto y Venta, con % por etapa y % general, más cuellos de botella.
- 07 Gestión Comercial en CRM: tiempo de respuesta, registro/completado de campos, tiempo por etapa, calidad de respuesta y recontacto.
- 08 Impacto Económico Estimado: costo por venta estimado, relación inversión vs facturación, ahorro por optimización.
- 09 Benchmark y Contexto Competitivo: benchmark interno MDK, comparación histórica de KPIs, contexto competitivo con al menos un insight accionable.
- 10 Riesgos y Alertas: saturación de audiencias, dependencia de canales, riesgos operativos/comerciales, alertas tempranas.
- 11 Plan de Acción (5 dimensiones, en narrativa): definición de objetivos y pauta, acciones inmediatas, ajustes estratégicos, nuevas implementaciones y recomendaciones al cliente.
`

    const systemPrompt = `${agentConfig.system_prompt}

Eres un analista de performance digital experto y conversacional. Trabajas como un asistente de chat libre: respondes exactamente lo que el usuario te pide, ya sea una pregunta puntual, un análisis parcial, una comparación o un informe completo. NO generes siempre un informe completo a menos que el usuario lo pida explícitamente.

CONTEXTO DEL CLIENTE (úsalo como referencia cuando sea relevante):
- Cliente: ${client.nombre_del_negocio}
- Plan: ${client.plan || 'No especificado'}
- Plantilla de informe que aplica: ${planInforme}
- Periodo seleccionado: ${periodoTexto}

${guiaInformes}

HISTORIAL Y CONTEXTO DEL CLIENTE:
${clienteMemoriaText}

TAREAS REALIZADAS EN EL PERIODO:
${tareasText}

METRICAS DE CUENTAS PUBLICITARIAS:
${metricasText}

${metaErrors.length > 0 || googleErrors.length > 0 ? `ALERTAS DE CONFIGURACION:
${metaErrors.map(e => `⚠️ ${e}`).join('\n')}
${googleErrors.map(e => `⚠️ ${e}`).join('\n')}

Si el usuario pregunta por métricas y hay alertas, explícitamente informa qué plataforma(s) no pudieron conectarse y por qué. NO ocultes estos errores.` : ''}

IMPORTANTE SOBRE LAS METRICAS:
${metricsByAccount.length > 0
  ? 'Las métricas anteriores son DATOS REALES obtenidos directamente desde las APIs de Meta Ads y/o Google Ads para el periodo seleccionado. NO son estimaciones. Trátalas como cifras oficiales y exactas. NUNCA digas que son estimativas, aproximadas o simuladas. Tienes ACCESO al DESGLOSE DIARIO por cuenta (sección "DESGLOSE DIARIO POR CUENTA") y al DESGLOSE POR CAMPAÑA (sección "DESGLOSE POR CAMPAÑA"). Úsalos cuando el usuario pida datos, gráficos o tendencias por día o por campaña. NUNCA digas que no tienes los datos desglosados por día o por campaña si esas secciones contienen filas. Si el usuario pide un rango específico de días (ej. del 1 al 5), filtra el desglose diario a esas fechas y construye el gráfico con un punto por día. Si pide datos por campaña, usa la sección de desglose por campaña.'
  : 'No se pudieron obtener métricas reales de las cuentas publicitarias para este periodo (puede que no haya tokens conectados, que la cuenta no tenga actividad en el periodo, o que haya un error de conexión). Si el usuario pide análisis de números, indícale claramente que no hay datos disponibles y NO inventes ni estimes cifras.'}

COMO RESPONDER:
- Conversa de forma natural y directa. Si el usuario hace una pregunta corta, responde corto.
- Usa las métricas y el contexto de arriba para fundamentar tus respuestas.
- Identifica tendencias, problemas y oportunidades cuando aporte valor.
- Da recomendaciones concretas y accionables.
- Si el usuario pide un informe, entonces sí estructura un informe completo siguiendo la ESTRUCTURA OFICIAL DE LOS INFORMES que corresponda al plan del cliente (Esencial = 6 slides, Estratégico = 11 slides). Respetá el orden y los títulos de las slides. Si te falta algún dato para completar una slide, pedíselo explícitamente al usuario en vez de inventarlo o dejarlo vacío.

CAPACIDADES DE VISUALIZACION:
Cuando una visualización ayude a explicar los datos (o cuando el usuario la pida), genera gráficos y archivos usando estos bloques especiales. No es obligatorio en cada mensaje, úsalos cuando aporten valor.

Para GRAFICOS de barras, lineas, areas o pie, usa un bloque de codigo con la palabra chart:

` + "```" + `chart
{"type":"bar","title":"Inversion por Plataforma","data":[{"name":"Meta Ads","value":1500},{"name":"Google Ads","value":2300}],"xKey":"name","yKey":"value","format":"currency"}
` + "```" + `

Tipos disponibles: "bar", "line", "area", "pie"
Campo "format" (opcional): "currency" para dinero ($), "percent" para porcentajes (%), "number" para cantidades. Úsalo para que los ejes y tooltips muestren los valores con el formato correcto (ej. inversión y CPL usan "currency", CTR usa "percent", leads/clics/impresiones usan "number").

Para generar ARCHIVOS descargables (CSV de datos, reportes), usa un bloque de codigo con la palabra file:

` + "```" + `file
{"name":"metricas-mayo-2026.csv","type":"text/csv","content":"Plataforma,Inversion,Leads,CPL\\nMeta Ads,1500,45,33.33\\nGoogle Ads,2300,62,37.10"}
` + "```" + `

Para generar IMAGENES (banners, gráficos visuales, ilustraciones para reportes), usa un bloque de codigo con la palabra image y describe lo que quieres generar:
  
  ` + "```" + `image
  {"prompt":"Descripcion detallada en ingles de la imagen a generar, estilo profesional para reporte de marketing","alt":"Texto alternativo descriptivo"}
  ` + "```" + `
  
  Para generar un INFORME EN PDF descargable, usa un bloque de codigo con la palabra pdf. MUY IMPORTANTE: el PDF se construye AUTOMÁTICAMENTE a partir de TODO el texto y los gráficos (bloques chart) que escribas en este mismo mensaje. Por eso, antes del bloque pdf debes escribir el análisis completo con datos reales (resumen, métricas, desglose) y los gráficos correspondientes. El bloque pdf en sí solo necesita el nombre y el título. NUNCA digas "voy a generar el PDF y te lo envío en breve": basta con escribir el contenido y luego el bloque pdf.
  
  ` + "```" + `pdf
  {"name":"informe-junio-2026.pdf","title":"Informe de Cierre - ICS Salud","subtitle":"Periodo: Junio 2026"}
  ` + "```" + `
  
  Opcionalmente puedes añadir "sections" (array) con secciones extra: cada sección admite "heading", "text", "bullets" (array) y/o "table" ({headers:[], rows:[[]]}). Pero no es obligatorio, ya que el PDF toma el contenido del mensaje. Lo esencial es que el mensaje contenga el análisis y los gráficos ANTES del bloque pdf.

REGLAS DE VISUALIZACION:
- Usa gráficos cuando compares números entre plataformas, periodos o categorías.
- No necesitas especificar colores: las gráficas usan automáticamente la paleta del sistema. Especifica siempre el campo "format" correcto ("currency", "percent" o "number") para que los valores se muestren bien.
- Usa "pie" para distribución/proporción, "bar" para comparar categorías, "line"/"area" para tendencias en el tiempo.
  - Ofrece un CSV descargable cuando el usuario pida exportar datos o cuando generes un informe completo.
  - Cuando el usuario pida un PDF o un informe descargable, primero escribe el análisis completo con datos reales y sus gráficos, y luego añade el bloque pdf al final (el PDF se arma con ese contenido). NUNCA prometas enviarlo "en breve" ni emitas un bloque pdf sin haber escrito antes el análisis y los gráficos.

ANALISIS DE IMAGENES Y DOCUMENTOS:
- Si el usuario adjunta imágenes (capturas de dashboards, reportes, anuncios), analízalas detalladamente, extrae los datos que puedas ver y úsalos en tu análisis.
- Si el usuario adjunta PDF o Excel, el contenido ya ha sido parseado y está disponible en el contexto. Úsalo para:
  * Validar o complementar las métricas de las APIs
  * Extraer datos adicionales (CRM, ventas, feedback comercial, información de clientes)
  * Crear análisis comparativos entre los datos de las plataformas y los datos del cliente
  * Detectar discrepancias o patrones que merezcan investigación
- IMPORTANTE: Si el usuario te pide que analices un archivo pero no ve el contenido en tu respuesta, avísale que necesita recargar la página o reenviar el archivo.

FORMATO:
- Usa markdown para estructura.
- Destaca números importantes en **negrita**.
- Sé claro y conciso.
`

    // Check attachments
    const hasImages = attachments?.some((a: { type: string }) => a.type?.startsWith('image/'))
    const hasDocuments = attachments?.some((a: { type: string }) => 
      a.type?.includes('pdf') || 
      a.type?.includes('spreadsheet') || 
      a.type?.includes('excel') ||
      a.type?.includes('sheet')
    )
    
    // Build documents context if present
    let documentsContext = ''
    if (hasDocuments) {
      const documentAttachments = attachments.filter((a: { type: string }) => 
        a.type?.includes('pdf') || 
        a.type?.includes('spreadsheet') || 
        a.type?.includes('excel') ||
        a.type?.includes('sheet')
      )
      documentsContext = `\n\nARCHIVOS ADJUNTOS CARGADOS:
${documentAttachments.map((a: { name?: string; type: string }, idx: number) => 
  `- Archivo ${idx + 1}: ${a.name || 'Documento'} (${a.type})`
).join('\n')}

Estos archivos han sido parseados y sus contenidos están disponibles en el contexto. Si contienen datos, tablas o información relevante, úsalos en tu análisis junto con las métricas de las APIs.`
    }
    
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
                  { type: 'text', text: m.content + documentsContext },
                  ...imageAttachments.map((a: { url: string }) => ({
                    type: 'image',
                    image: a.url,
                  }))
                ]
              }
            }
          }
          return { role: m.role, content: m.content + documentsContext }
        })
      : [{
          role: 'user',
          content: `Genera un informe de análisis completo para ${client.nombre_del_negocio} del periodo ${periodoTexto}. Incluye gráficos de visualización, un CSV descargable y un informe en PDF (bloque pdf) con los datos.${documentsContext}`
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

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('Error in analista agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
