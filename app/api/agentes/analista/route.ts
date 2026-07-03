import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'
import { parseAttachments } from '@/lib/parse-attachments'

export const maxDuration = 120

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const GOOGLE_ADS_API_VERSION = 'v23'

type DailyPoint = { date: string; spend: number; leads: number; impressions: number; clicks: number }
type CampaignPoint = { name: string; spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number }
type AccountMetrics = {
  accountName?: string
  spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number
  daily: DailyPoint[]
  campaigns: CampaignPoint[]
}

type MetaAction = { action_type: string; value: string }

// --------------------------------------------------------------------------------
// Mapeo de "Resultado" segun el objetivo de la campaña.
// Meta Ads Manager no usa siempre el mismo action_type para la columna "Resultados":
// depende de para qué está optimizada cada campaña (leads de formulario, conversaciones
// de WhatsApp/Messenger, ventas, trafico, etc). Si solo buscamos "lead" a secas,
// las campañas de WhatsApp (Conversaciones iniciadas) terminan en 0 o con un numero
// suelto que no tiene nada que ver con el resultado real mostrado en la plataforma.
// --------------------------------------------------------------------------------
const RESULT_ACTION_TYPES_BY_OBJECTIVE: Record<string, string[]> = {
  LEAD_GENERATION: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  OUTCOME_LEADS: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  MESSAGES: [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'messaging_conversation_started_7d',
  ],
  OUTCOME_ENGAGEMENT: [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'messaging_conversation_started_7d',
  ],
  CONVERSIONS: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  OUTCOME_SALES: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  LINK_CLICKS: ['link_click'],
  OUTCOME_TRAFFIC: ['link_click', 'landing_page_view'],
}

// Orden de búsqueda "best effort" cuando no sabemos (o no llegó) el objetivo de la campaña.
// Se prueba cada grupo en orden y se usa el primero que tenga datos > 0.
const FALLBACK_ACTION_GROUPS: string[][] = [
  ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'messaging_conversation_started_7d',
  ],
  ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  ['link_click'],
]

// IMPORTANTE: dentro de un mismo grupo (ej. los distintos action_type que representan
// "conversaciones de WhatsApp"), Meta suele devolver más de un action_type para EL MISMO
// resultado (ej. "onsite_conversion.messaging_conversation_started_7d" y
// "onsite_conversion.total_messaging_connection" para la misma conversación). Si se suman
// todos, el número queda duplicado. Por eso acá se toma el PRIMER action_type de la lista
// que tenga datos, nunca se suman varios entre sí.
function pickActionValue(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions || actions.length === 0) return 0
  for (const type of types) {
    const match = actions.find((a) => a.action_type === type)
    if (match) return parseInt(match.value, 10) || 0
  }
  return 0
}

// Calcula el "Resultado" de una fila de insights (cuenta o campaña) respetando
// el objetivo de la campaña cuando está disponible, y si no, probando los grupos
// de acciones más comunes hasta encontrar uno con datos.
function getResultValue(actions: MetaAction[] | undefined, objective?: string): number {
  if (!actions || actions.length === 0) return 0

  if (objective) {
    const key = objective.toUpperCase()
    const types = RESULT_ACTION_TYPES_BY_OBJECTIVE[key]
    if (types) {
      const value = pickActionValue(actions, types)
      if (value > 0) return value
    }
  }

  for (const group of FALLBACK_ACTION_GROUPS) {
    const value = pickActionValue(actions, group)
    if (value > 0) return value
  }

  return 0
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

    // Get account name
    let accountName = accountId
    try {
      const cleanId = accountId.replace('act_', '')
      const nameUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${cleanId}?fields=name&access_token=${accessToken}`
      const nameResp = await fetch(nameUrl)
      const nameData = await nameResp.json()
      if (nameResp.ok && nameData.name) {
        accountName = nameData.name
        console.log('[v0] Meta account name retrieved:', accountName)
      } else {
        console.warn('[v0] Meta name response not ok or no name:', { status: nameResp.status, nameData })
      }
    } catch (e) {
      console.warn('[v0] Error fetching Meta account name:', e)
    }

    const timeRange = JSON.stringify({ since: startDate, until: endDate })
    const fields = 'impressions,clicks,spend,actions'

    // --------------------------------------------------------------------------
    // 1) Campaign-level breakdown PRIMERO (incluye "objective" para poder elegir
    //    el action_type correcto por campaña). Los totales de cuenta y el desglose
    //    diario se derivan de acá para que todo sea consistente entre sí.
    // --------------------------------------------------------------------------
    const campaigns: CampaignPoint[] = []
    const campaignObjectiveById = new Map<string, string>()
    try {
      const campUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId.replace('act_', '')}/insights?access_token=${accessToken}&fields=campaign_id,campaign_name,objective,${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&limit=200`
      const campResp = await fetch(campUrl)
      if (campResp.ok) {
        const campData = await campResp.json()
        for (const row of campData.data || []) {
          const cImpr = parseInt(row.impressions || '0', 10)
          const cClicks = parseInt(row.clicks || '0', 10)
          const cSpend = parseFloat(row.spend || '0')
          const cLeads = getResultValue(row.actions, row.objective)
          if (row.campaign_id) campaignObjectiveById.set(row.campaign_id, row.objective || '')
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
      } else {
        console.error('[v0] Meta campaign insights error:', campResp.status)
      }
    } catch (e) {
      console.error('[v0] Error fetching Meta campaigns:', e)
    }

    // --------------------------------------------------------------------------
    // 2) Desglose diario a nivel cuenta. Acá no tenemos el objetivo por fila (es
    //    a nivel cuenta, mezcla campañas), así que usamos el fallback "best effort"
    //    sumando los grupos de acciones más comunes (leads + mensajes + ventas).
    // --------------------------------------------------------------------------
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId.replace('act_', '')}/insights?access_token=${accessToken}&fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=account&time_increment=1`

    const response = await fetch(url)
    if (!response.ok) {
      console.error('[v0] Meta API error:', response.status)
      return null
    }

    const data = await response.json()
    if (!data.data || data.data.length === 0) {
      // Si no hay desglose diario pero sí hay campañas, igual devolvemos los totales por campaña
      const spend = campaigns.reduce((s, c) => s + c.spend, 0)
      const leads = campaigns.reduce((s, c) => s + c.leads, 0)
      const impressions = campaigns.reduce((s, c) => s + c.impressions, 0)
      const clicks = campaigns.reduce((s, c) => s + c.clicks, 0)
      return {
        accountName,
        spend,
        leads,
        cpl: leads > 0 ? spend / leads : 0,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        daily: [],
        campaigns,
      }
    }

    let impressions = 0
    let clicks = 0
    let spend = 0
    const daily: DailyPoint[] = []

    for (const row of data.data) {
      const dImpr = parseInt(row.impressions || '0', 10)
      const dClicks = parseInt(row.clicks || '0', 10)
      const dSpend = parseFloat(row.spend || '0')
      // Para cada grupo de objetivo (leads / mensajes / ventas) se toma solo el PRIMER
      // action_type que matchee dentro del grupo (pickActionValue evita el doble conteo),
      // y luego SÍ se suman los distintos grupos entre sí, porque a nivel cuenta puede haber
      // campañas con distintos objetivos corriendo el mismo día (eso no es duplicación).
      const dLeads =
        pickActionValue(row.actions, RESULT_ACTION_TYPES_BY_OBJECTIVE.LEAD_GENERATION) +
        pickActionValue(row.actions, RESULT_ACTION_TYPES_BY_OBJECTIVE.MESSAGES) +
        pickActionValue(row.actions, RESULT_ACTION_TYPES_BY_OBJECTIVE.CONVERSIONS)
      impressions += dImpr
      clicks += dClicks
      spend += dSpend
      daily.push({
        date: row.date_start || row.date_stop || '',
        spend: dSpend,
        leads: dLeads,
        impressions: dImpr,
        clicks: dClicks,
      })
    }

    // --------------------------------------------------------------------------
    // 3) Totales de cuenta: se calculan como la SUMA de los resultados ya
    //    corregidos por campaña (más confiable que volver a filtrar por un solo
    //    action_type a nivel cuenta), salvo que no haya campañas (cuenta vacía).
    // --------------------------------------------------------------------------
    const totalSpendFromCampaigns = campaigns.reduce((s, c) => s + c.spend, 0)
    const totalLeadsFromCampaigns = campaigns.reduce((s, c) => s + c.leads, 0)

    const finalSpend = campaigns.length > 0 ? totalSpendFromCampaigns : spend
    const finalLeads = campaigns.length > 0 ? totalLeadsFromCampaigns : daily.reduce((s, d) => s + d.leads, 0)
    const cpl = finalLeads > 0 ? finalSpend / finalLeads : 0
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0

    return { accountName, spend: finalSpend, leads: finalLeads, cpl, impressions, clicks, ctr, daily, campaigns }
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

    // Get account name
    let accountName = customerId
    try {
      const nameQuery = `SELECT customer.descriptive_name FROM customer`
      const nameResp = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: nameQuery }),
      })
      const nameData = await nameResp.json()
      // Google Ads API returns fields in camelCase (descriptiveName)
      const customer = nameData.results?.[0]?.customer
      const descriptiveName = customer?.descriptiveName || customer?.descriptive_name
      if (nameResp.ok && descriptiveName) {
        accountName = descriptiveName
        console.log('[v0] Google account name retrieved:', accountName)
      } else {
        console.warn('[v0] Google name not found, using ID. Customer object:', customer)
      }
    } catch (e) {
      console.warn('[v0] Error fetching Google account name:', e)
    }

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

    console.log('[v0] Google Ads account name:', accountName)

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

    return { accountName, spend, leads, cpl, impressions, clicks, ctr, daily, campaigns }
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
    const { clientId, periodo, cuentas, messages, month, year, attachments, dateStart, dateEnd } = await req.json()

    // Use explicit periodo if provided, otherwise fallback to dateStart/dateEnd
    let receivedPeriodo = periodo
    if (!receivedPeriodo && dateStart && dateEnd) {
      receivedPeriodo = {
        start: dateStart,
        end: dateEnd,
      }
    }

    console.log('[v0] Analista request:', { clientId, month, year, periodo: receivedPeriodo, attachmentsCount: attachments?.length || 0 })

    // Calculate period from month/year if not provided directly
    let effectivePeriodo = receivedPeriodo
    if (!effectivePeriodo && month && year) {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0) // Last day of month
      effectivePeriodo = {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    }

    console.log('[v0] Effective period:', effectivePeriodo)

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

    // Si el cliente usa GHL, traer la última ejecución de RevOps para poder
    // completar la sección "Gestión Comercial en CRM" del informe Estratégico
    // sin tener que pedirle esos datos de cero al account manager.
    let revopsText = ''
    if (client.crm_type === 'ghl' && client.ghl_location_id) {
      const { data: revopsEjecucion } = await supabase
        .from('revops_ejecuciones')
        .select('ejecutado_en, estado, score_salud, resumen')
        .eq('cliente_id', clientId)
        .eq('estado', 'ok')
        .order('ejecutado_en', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (revopsEjecucion?.resumen) {
        const r = revopsEjecucion.resumen as any
        revopsText = `Última auditoría RevOps del CRM (${new Date(revopsEjecucion.ejecutado_en).toLocaleDateString('es-AR')}, score de salud ${revopsEjecucion.score_salud ?? '—'}/100):
- Tiempo de respuesta: promedio ${r?.tiempos_respuesta?.promedio_primera_respuesta_min != null ? `${Math.round(r.tiempos_respuesta.promedio_primera_respuesta_min)} min hábiles` : 'sin datos suficientes'} para la primera respuesta.
- Registro y campos: ${r?.oportunidades?.pct_sin_monto != null ? `${Math.round(r.oportunidades.pct_sin_monto * 100)}% de las oportunidades abiertas sin monto cargado` : 'sin datos'}.
- Tiempo por etapa / estancamiento: ${r?.embudo?.estancadas_30 ?? 0} oportunidades estancadas 30d+, ${r?.embudo?.estancadas_90 ?? 0} estancadas 90d+.
- Calidad de respuesta: score promedio de conversaciones auditadas ${r?.conversaciones_calidad?.promedio_score != null ? `${r.conversaciones_calidad.promedio_score.toFixed(1)}/10` : 'sin datos'}.
- Recontacto / handoffs: ${r?.tiempos_respuesta?.handoffs_sin_tomar ?? 0} casos donde se prometió derivar y nadie tomó la conversación.
Usá estos datos como base real para la slide 07 (Gestión Comercial en CRM) en vez de pedírselos al usuario. Si necesitás más detalle, podés sugerir correr RevOps de nuevo antes de cerrar el informe.`
      }
    }

    // Get access tokens for direct API calls
    // Meta: from environment variable (same as /api/ads/meta)
    const metaAccessToken = process.env.META_ADS_ACCESS_TOKEN
    // Google: use centralized helper that refreshes the token and reads from DB/env
    const { accessToken: googleAccessToken } = await getGoogleAdsAccessToken()
    const googleDeveloperToken = getGoogleAdsDeveloperToken()
    const googleLoginCustomerId = getGoogleAdsLoginCustomerId()

    // Fetch metrics for accounts (account names are fetched directly from the Meta/Google APIs)
    const metricsByAccount: Array<{
      account: string
      accountName: string
      platform: string
      spend: number
      leads: number
      cpl: number
      impressions: number
      clicks: number
      ctr: number
      daily: DailyPoint[]
      campaigns: CampaignPoint[]
    }> = []

    const selectedCuentas = cuentas && cuentas.length > 0 ? cuentas : []

    console.log('[v0] Tokens found:', { meta: !!metaAccessToken, google: !!googleAccessToken, googleDevToken: !!googleDeveloperToken })

    // Fetch Meta accounts metrics
    // Parse Meta Ads account IDs (can be string like "123,456" or array)
    let metaAccounts: string[] = []
    if (client.meta_ads_account_ids?.length) {
      metaAccounts = Array.isArray(client.meta_ads_account_ids)
        ? client.meta_ads_account_ids
        : String(client.meta_ads_account_ids).split(',').map(id => id.trim())
    } else if (client.meta_ads_account_id) {
      metaAccounts = Array.isArray(client.meta_ads_account_id)
        ? client.meta_ads_account_id
        : String(client.meta_ads_account_id).split(',').map(id => id.trim())
    }

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
              accountName: metrics.accountName || accountId,
              platform: 'Meta Ads',
              ...metrics
            })
          } else {
            metaErrors.push(`Meta Ads (${accountId}): No se pudieron obtener métricas (verifica que la cuenta esté activa y tenga datos en el periodo)`)
          }
        }
      }
    }

    // Fetch Google accounts metrics
    // Parse Google Ads customer IDs (can be string like "123,456,789" or array)
    let googleAccounts: string[] = []
    if (client.google_ads_customer_ids?.length) {
      googleAccounts = Array.isArray(client.google_ads_customer_ids) 
        ? client.google_ads_customer_ids 
        : String(client.google_ads_customer_ids).split(',').map(id => id.trim())
    } else if (client.google_ads_customer_id) {
      googleAccounts = Array.isArray(client.google_ads_customer_id)
        ? client.google_ads_customer_id
        : String(client.google_ads_customer_id).split(',').map(id => id.trim())
    }

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
              accountName: metrics.accountName || accountId,
              platform: 'Google Ads',
              ...metrics
            })
          } else {
            googleErrors.push(`Google Ads (${accountId}): No se pudieron obtener métricas (verifica las credenciales y que la cuenta esté activa)`)
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
  `• ${m.accountName} (${m.account}) - ${m.platform}:
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
    return `• ${m.accountName} (${m.account}) - ${m.platform}: sin datos diarios disponibles`
  }
  const rows = m.daily.map(d => 
    `    ${d.date}: ${d.leads} leads | $${d.spend.toFixed(2)} inversión | ${d.impressions.toLocaleString()} impresiones | ${d.clicks.toLocaleString()} clics`
  ).join('\n')
  return `• ${m.accountName} (${m.account}) - ${m.platform}:\n${rows}`
}).join('\n')}

DESGLOSE POR CAMPAÑA (datos reales por campaña):
${metricsByAccount.map(m => {
  if (!m.campaigns || m.campaigns.length === 0) {
    return `• ${m.accountName} (${m.account}) - ${m.platform}: sin datos de campañas disponibles`
  }
  const rows = m.campaigns
    .sort((a, b) => b.spend - a.spend)
    .map(c => 
      `    "${c.name}": ${c.leads} leads | $${c.spend.toFixed(2)} inversión | CPL $${c.cpl.toFixed(2)} | ${c.impressions.toLocaleString()} impresiones | ${c.clicks.toLocaleString()} clics | CTR ${c.ctr.toFixed(2)}%`
    ).join('\n')
  return `• ${m.accountName} (${m.account}) - ${m.platform}:\n${rows}`
}).join('\n')}`
    }

    const periodoTexto = effectivePeriodo?.start && effectivePeriodo?.end 
      ? (() => {
          const start = new Date(effectivePeriodo.start)
          const end = new Date(effectivePeriodo.end)
          const startDay = start.getDate()
          const startMonth = start.toLocaleString('es-ES', { month: 'long' })
          const endDay = end.getDate()
          const endMonth = end.toLocaleString('es-ES', { month: 'long' })
          const year = end.getFullYear()

          if (startMonth === endMonth) {
            return `${startDay} - ${endDay} de ${startMonth} ${year}`
          } else {
            return `${startDay} de ${startMonth} - ${endDay} de ${endMonth} ${year}`
          }
        })()
      : 'últimos 30 días'

    // Detect which report template applies based on the client's plan
    const planNormalizado = (client.plan || '').toLowerCase()
    const esEstrategico = planNormalizado.includes('estrat')
    const esEsencial = planNormalizado.includes('esencial')
    const planInforme = esEstrategico ? 'Estratégico' : esEsencial ? 'Esencial' : 'No determinado'

    // Knowledge of MDK's official report structures (PPTX templates) so the
    // agent builds reports matching the right template for the client's plan.
    // Transcripto literalmente de Informe_Esencial_MDK.pptx e Informe_Estrategico_MDK.pptx.
    const guiaInformes = `
ESTRUCTURA OFICIAL DE LOS INFORMES DE CIERRE DE MES (MDK):
Cuando el usuario pida un INFORME o un PDF de cierre de mes, NO inventes la estructura ni los campos: usá EXACTAMENTE la plantilla oficial que corresponda al plan del cliente, con los mismos títulos, secciones y campos que se detallan abajo (son las plantillas .pptx reales de MDK). El plan detectado para este cliente es: "${planInforme}" (plan crudo: "${client.plan || 'sin definir'}").

Cada campo abajo está marcado como:
- (AUTOMÁTICO) → se completa con las métricas reales de la sección "METRICAS DE CUENTAS PUBLICITARIAS" / tareas / memoria del cliente ya incluidas en este prompt. Nunca lo dejes vacío si el dato está disponible ahí.
- (MANUAL) → NO viene de ninguna API conectada a este chat (ventas cerradas, funnel comercial en CRM, capturas de anuncios, contexto de mercado/competencia, feedback comercial cualitativo, objetivos del mes, etc.). Si el usuario no te lo dio en la conversación, NO LO INVENTES.

Reglas generales para AMBOS informes:
- Completá cada campo (AUTOMÁTICO) con datos reales y específicos del contexto. Nunca frases genéricas.
- Los tests SIEMPRE deben incluir un resultado cuantitativo (ej. "+20% CTR").
- Tono profesional, directo y orientado al negocio del cliente. La sección de CRM/gestión comercial debe tener tono constructivo, nunca acusatorio.
- Al terminar de armar el borrador del informe (primera vez que lo mostrás en la conversación), agregá al final una sección aparte con encabezado "🔲 INFORMACIÓN QUE NECESITO QUE ME CONFIRMES O COMPLETES:" listando, en una lista con viñetas, CADA campo (MANUAL) que quedó sin dato — usando el mismo nombre de campo que la plantilla (ej. "Objetivo del período", "Ventas cerradas en el período", "Capturas de los anuncios testeados (Anuncio A/B/C)", "Funnel comercial en CRM por zona: Leads, MQL, Contacto, SQL, Presupuesto, Venta"). No los dejes solo como "[Dato no provisto]" perdidos en el cuerpo del informe: además tienen que aparecer en esa lista consolidada al final para que el account manager sepa exactamente qué responder.
- Si el usuario después te da esos datos, actualizá el informe completo (sacando el campo de la lista de pendientes) y volvé a preguntar si confirma, como indica el FLUJO DE REVISION Y CONFIRMACION.

▶ PLAN ESENCIAL — "INFORME DE RESULTADOS" (6 slides + portada):
- Portada: Cliente (AUTOMÁTICO — nombre del cliente) · Período: mes/año (AUTOMÁTICO) · Responsable (MANUAL, nombre del PM/AM a cargo).
- 01 RESUMEN DEL PERÍODO:
  - 🎯 Objetivo de la pauta (MANUAL — ej. "Generar leads calificados a un CPL ≤ $X").
  - 💡 Conclusión general, 2-3 líneas (AUTOMÁTICO en base a las métricas, mezclando con el objetivo si está).
  - 📊 Cumplimiento de objetivo: tarjetas con "[N] LEADS GENERADOS / objetivo: [N]" (leads AUTOMÁTICO, objetivo MANUAL), "$[X] CPL PROMEDIO / objetivo: $[X]" (CPL AUTOMÁTICO, objetivo MANUAL), "[X%] CUMPLIMIENTO ✅/⚠️/❌" (se calcula si hay objetivo, si no MANUAL).
- 02 RESULTADOS DE CAMPAÑAS: 4 tarjetas de encabezado — Inversión total, Leads generados, CPL promedio, Variación vs período anterior (todas AUTOMÁTICO). Tabla por campaña: Campaña | Inversión | Leads | CPL | vs anterior, con fila TOTAL (AUTOMÁTICO, usar el desglose por campaña).
- 03 ACCIONES REALIZADAS: Cambios en campañas (MANUAL/journal de tareas — cruzar con "TAREAS REALIZADAS EN EL PERIODO" si hay), Optimizaciones aplicadas (idem), Tests ejecutados con resultado cuantitativo (idem, ej. "+20% CTR").
- 04 ANÁLISIS DEL FUNNEL (SÍNTESIS): "[N] LEADS POR PAUTA EN CRM ingresados en el período" (MANUAL, viene del CRM), "[<20%] DIFERENCIA VS PLATAFORMA" (MANUAL, compara CRM vs AUTOMÁTICO de plataforma), "⚠️ Cuello de botella (si aplica)" (MANUAL), "💡 Oportunidades detectadas" (MANUAL). Nota: el análisis profundo de pipeline es exclusivo del Plan Estratégico, acá va solo la síntesis.
- 05 QUÉ FUNCIONÓ / QUÉ NO: ✅ Mensajes/piezas con mejor resultado + dato clave (AUTOMÁTICO si se puede inferir de campañas con mejor CPL/CTR, si no MANUAL), Audiencia/formato que mejor respondió (MANUAL), Aprendizaje clave (MANUAL). ❌ Audiencias/formatos descartados + motivo (MANUAL), Mensajes sin tracción (MANUAL), Problema detectado (MANUAL).
- 06 PLAN DEL MES SIGUIENTE: Qué se va a ajustar (MANUAL), Qué se va a testear (MANUAL), Requerimientos al cliente (MANUAL).

▶ PLAN ESTRATÉGICO — "INFORME ESTRATÉGICO DE RESULTADOS" (11 slides + portada):
- Portada: Cliente (AUTOMÁTICO) · Período (AUTOMÁTICO) · Ejecutivo (MANUAL).
- 01 RESUMEN EJECUTIVO: 4 tarjetas — Leads, CPL, Ventas (MANUAL), Inversión (AUTOMÁTICO las otras tres menos Ventas). "CUMPLIMIENTO: ✅/⚠️/❌ — [X%] del objetivo alcanzado" (necesita objetivo, MANUAL si no está). Objetivo del período (MANUAL). Contexto del mes: mercado, estacionalidad, cambios internos del cliente (MANUAL). Conclusión general (AUTOMÁTICO combinando lo anterior).
- 02 ¿EN QUÉ ESTUVIMOS TRABAJANDO ESTE MES?: 4 pilares con ícono — 🎯 Estrategia (foco del mes, hipótesis) (MANUAL), ⚙️ Operaciones (configuraciones, lanzamientos, ajustes técnicos) (MANUAL, cruzar con tareas), 🧪 Testing (tests creativos/audiencia/formato) (MANUAL/tareas), 📈 Optimización (mejoras basadas en datos: pujas, presupuesto, segmentación) (MANUAL/tareas).
- 03 TESTING Y OPTIMIZACIÓN CREATIVA: Anuncio A / Anuncio B / Anuncio C con imagen de cada anuncio (MANUAL — pedí las capturas/imágenes si no las adjuntaron). Análisis: qué anuncio ganó, métricas comparativas CTR/CPL/volumen, top anuncios por campaña y por calidad de venta (MANUAL, salvo las métricas de CTR/CPL que sí pueden salir de AUTOMÁTICO si identificás el anuncio).
- 04 PERFORMANCE DE CAMPAÑAS: dos tablas separadas, "META ADS" y "GOOGLE ADS", cada una: Campaña | Inversión | Leads | CPL | CPC | CTR, con fila TOTAL (AUTOMÁTICO, usar desglose por campaña y por plataforma).
- 05 ACCIONES REALIZADAS: Cambios en campañas con contexto (MANUAL/tareas), Optimizaciones aplicadas (MANUAL/tareas), Tests ejecutados A vs B con resultado y datos (MANUAL/tareas).
- 06 IMPACTO EN EL NEGOCIO — FUNNEL COMERCIAL: tabla con etapas Leads, MQL, Contacto, SQL, Presupuesto, Venta, desglosada por "ZONA 1" y "ZONA 2" (cada una con su columna de %) más columna TOTAL y % GENERAL (TODO MANUAL — viene del CRM, no de las APIs de ads conectadas acá). "⚠️ Cuellos de botella": en qué etapa cae más el funnel, qué zona pierde más, oportunidades de mejora (MANUAL).
- 07 GESTIÓN COMERCIAL EN CRM: ⏱️ Tiempo de respuesta (MANUAL), 📋 Registro y campos — % de oportunidades con campos incompletos (MANUAL), 🔄 Tiempo por etapa — % de leads estancados (MANUAL), 💬 Calidad de respuesta (MANUAL), 📞 Recontacto (MANUAL). Si el cliente tiene GHL conectado y hay una ejecución reciente del agente RevOps, podés usar esos datos como referencia para esta sección en vez de pedirlos de cero.
- 08 IMPACTO ECONÓMICO ESTIMADO: "$[X] COSTO POR VENTA ESTIMADO" = inversión total / ventas cerradas (MANUAL, necesita ventas), "[X]x INVERSIÓN VS FACTURACIÓN" (MANUAL, necesita facturación), "$[X] AHORRO POR OPTIMIZACIÓN" vs período anterior o benchmark (AUTOMÁTICO si hay variación de CPL vs período anterior, si no MANUAL).
- 09 BENCHMARK Y CONTEXTO COMPETITIVO: 📊 Benchmark interno MDK — comparación contra promedio de la cuenta en 3-6 meses o cuentas del sector (MANUAL, salvo que haya histórico suficiente en el desglose diario para inferirlo), 📈 Comparación histórica de KPIs mes a mes (AUTOMÁTICO parcial con el desglose diario/vs período anterior disponible), 🔍 Contexto competitivo — qué hace la competencia (MANUAL).
- 10 RIESGOS Y ALERTAS: 🔴 Saturación de audiencias — frecuencia alta, CTR cayendo, CPL subiendo (AUTOMÁTICO si se detecta en las métricas), 🟠 Dependencia de canales — concentración en un canal y % de riesgo (AUTOMÁTICO, calculable con el split de inversión por plataforma), 🟡 Riesgos operativos/comerciales — tracking, integraciones, demoras del equipo comercial (MANUAL), ⚡ Alertas tempranas a 30-60 días (MANUAL/mixto).
- 11 PLAN DE ACCIÓN — PRÓXIMO PERÍODO (5 puntos en narrativa): Definición de objetivos y pauta (MANUAL), Acciones inmediatas (MANUAL, aunque podés proponer en base a lo detectado en Riesgos), Ajustes estratégicos (MANUAL/propuesta propia), Nuevas implementaciones (MANUAL), Recomendaciones al cliente (MANUAL/propuesta propia).
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

${revopsText ? `DATOS DE GESTION COMERCIAL EN CRM (desde RevOps):
${revopsText}
` : ''}
METRICAS DE CUENTAS PUBLICITARIAS:
${metricasText}

${metaErrors.length > 0 || googleErrors.length > 0 ? `ALERTAS DE CONFIGURACION:
${metaErrors.map(e => `⚠️ ${e}`).join('\n')}
${googleErrors.map(e => `⚠️ ${e}`).join('\n')}

Si el usuario pregunta por métricas y hay alertas, explícitamente informa qué plataforma(s) no pudieron conectarse y por qué. NO ocultes estos errores.` : ''}

IMPORTANTE SOBRE LAS METRICAS:
${metricsByAccount.length > 0
  ? 'Las métricas anteriores son DATOS REALES obtenidos directamente desde las APIs de Meta Ads y/o Google Ads para el periodo seleccionado. NO son estimaciones. Trátalas como cifras oficiales y exactas. NUNCA digas que son estimativas, aproximadas o simuladas. Tienes ACCESO al DESGLOSE DIARIO por cuenta (sección "DESGLOSE DIARIO POR CUENTA") y al DESGLOSE POR CAMPAÑA (sección "DESGLOSE POR CAMPAÑA"). Úsalos cuando el usuario pida datos, gráficos o tendencias por día o por campaña. NUNCA digas que no tienes los datos desglosados por día o por campaña si esas secciones contienen filas. Si el usuario pide un rango específico de días (ej. del 1 al 5), filtra el desglose diario a esas fechas y construye el gráfico con un punto por día. Si pide datos por campaña, usa la sección de desglose por campaña.'
  : `CUENTAS VINCULADAS: ${metaAccounts.length > 0 ? `${metaAccounts.length} Meta Ads` : ''}${metaAccounts.length > 0 && googleAccounts.length > 0 ? ' + ' : ''}${googleAccounts.length > 0 ? `${googleAccounts.length} Google Ads` : ''}
PROBLEMA: No puedo acceder a las métricas en este momento. Las cuentas están vinculadas al cliente pero hay un error de conexión, tokens no configurados, o la cuenta no tiene actividad en el periodo.
ACCIÓN: Si el usuario pregunta por métricas, explícita y directamente dile: "Veo que tienes [cuentas] vinculadas pero no puedo acceder a las métricas en este momento. Para que pueda ayudarte con un análisis, ¿podrías compartirme los datos (inversión, leads, CPL) por plataforma? Pueden ser en un screenshot, archivo o simplemente diciéndome los números."
NO inventes ni estimes cifras bajo ninguna circunstancia.`}

COMO RESPONDER:
- Conversa de forma natural y directa. Si el usuario hace una pregunta corta, responde corto.
- Usa las métricas y el contexto de arriba para fundamentar tus respuestas.
- Identifica tendencias, problemas y oportunidades cuando aporte valor.
- Da recomendaciones concretas y accionables.
- Si el usuario pide un informe, entonces sí estructura un informe completo siguiendo la ESTRUCTURA OFICIAL DE LOS INFORMES que corresponda al plan del cliente (Esencial = 6 slides, Estratégico = 11 slides). Respetá el orden y los títulos de las slides. Si te falta algún dato para completar una slide, pedíselo explícitamente al usuario en vez de inventarlo o dejarlo vacío.

FLUJO DE REVISION Y CONFIRMACION (borrador -> PDF):
Este chat lo usa un account manager para preparar el informe de cierre de un cliente. El flujo esperado es:
1. Al arrancar la conversación, el primer pedido va a ser algo como "traé el informe completo del período para revisar" (SIN pedir el PDF todavía). En ese caso: armá el informe COMPLETO siguiendo AL PIE DE LA LETRA la plantilla oficial (ver ESTRUCTURA OFICIAL DE LOS INFORMES más abajo), completando cada campo (AUTOMÁTICO) con datos reales. Terminá el mensaje con la lista "🔲 INFORMACIÓN QUE NECESITO QUE ME CONFIRMES O COMPLETES" (con los campos MANUAL faltantes) y preguntando: "¿Confirmás esta información tal como está, querés que corrija algo, o me pasás lo que falta de la lista de arriba?". NO incluyas el bloque pdf en este mensaje: todavía no hay confirmación.
2. Si el usuario pide correcciones o te da la información que faltaba, aplicá el cambio, actualizá la lista de pendientes (sacando lo que ya te dieron) y volvé a mostrar el informe COMPLETO actualizado (no solo la parte que cambió), preguntando de nuevo si confirma. Cada iteración debe dejar el mensaje como una versión completa y autosuficiente del informe, porque es lo que se usa para generar el PDF.
3. Recién cuando el usuario CONFIRME explícitamente (ej. "confirmo", "dale, generá el PDF", "está bien así", "andá"), respondé con el informe completo final (el mismo contenido ya confirmado) seguido del bloque pdf correspondiente, tal como se explica en CAPACIDADES DE VISUALIZACION más abajo. Si todavía quedan campos MANUAL sin completar y el usuario confirma igual, generá el PDF dejando esos campos como "Dato no provisto" — no bloquees la generación del PDF por eso.
- Fuera de este flujo de informe de cierre (preguntas puntuales, análisis parciales, comparaciones), respondé de forma normal sin forzar este esquema de confirmación.

CAPACIDADES DE VISUALIZACION:
Cuando una visualización ayude a explicar los datos (o cuando el usuario la pida), genera gráficos y archivos usando estos bloques especiales. No es obligatorio en cada mensaje, úsalos cuando aporten valor.

Para GRAFICOS de barras, lineas, areas o pie, usa un bloque de codigo con la palabra chart:

` + "```" + `chart
{"type":"bar","title":"Inversion por Plataforma","data":[{"name":"Meta Ads","value":1500},{"name":"Google Ads","value":2300}],"xKey":"name","yKey":"value","format":"currency"}
` + "```" + `

Tipos disponibles: "bar", "line", "area", "pie"
Campo "format" (opcional): "currency" para dinero ($), "percent" para porcentajes (%), "number" para cantidades. Úsalo para que los ejes y tooltips muestren los valores con el formato correcto (ej. inversión y CPL usan "currency", CTR usa "percent", leads/clics/impresiones usan "number").

OPCIONES AVANZADAS PARA GRAFICOS DE BARRAS:
- "layout":"horizontal" -> dibuja las barras en horizontal (de izquierda a derecha). Útil cuando hay muchas categorías o nombres largos. Por defecto es vertical.
- "showValues":true -> muestra el valor numérico como etiqueta sobre/junto a cada barra.
- "series" -> array para comparar VARIAS métricas por categoría (ej. inversión Y leads en el mismo gráfico). Cada serie es {"key":"campoEnData","name":"Etiqueta","format":"currency|percent|number"}. Cuando uses "series", cada fila de "data" debe incluir un campo por cada key. NO uses "yKey" si usas "series".

Ejemplo: barras HORIZONTALES comparando inversión y leads por cuenta, con los valores visibles:
` + "```" + `chart
{"type":"bar","title":"Inversion y Leads por Cuenta","layout":"horizontal","showValues":true,"xKey":"name","series":[{"key":"inversion","name":"Inversion","format":"currency"},{"key":"leads","name":"Leads","format":"number"}],"data":[{"name":"Galeno","inversion":307618,"leads":192},{"name":"Prevencion","inversion":1120000,"leads":2033}]}
` + "```" + `
IMPORTANTE: si el usuario pide barras "horizontales", usa SIEMPRE "layout":"horizontal". Si pide ver la inversión y los leads juntos, usa "series" con ambas métricas. Si pide ver los valores/cifras en el gráfico, usa "showValues":true.

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

ANALISIS DE IMAGENES, DOCUMENTOS Y DATOS DEL USUARIO:
- Si el usuario adjunta imágenes (capturas de dashboards, reportes, planillas), analízalas detalladamente y extrae los datos.
- Si el usuario adjunta archivos CSV/Excel con datos de seguimiento o métricas:
  * PROCESA TODO EL CONTENIDO del archivo. NO pidas "más filas" ni "más datos". El archivo adjunto contiene toda la información necesaria.
  * Crea una tabla completa con TODAS las filas del archivo: Fecha, Leads de Plataforma, Leads del CRM (suma de formulario + WhatsApp), Variación (CRM - Plataforma).
  * Calcula la variación para CADA DÍA: Variación = (Leads Formulario + Leads WhatsApp) - Leads Plataforma.
  * Incluye un resumen al final: total de leads por plataforma, total de leads en CRM, diferencia acumulada, porcentaje de variación.
  * Crea gráficos visuales (barras horizontales) comparando Plataforma vs CRM para todo el período.
  * Si el archivo tiene columnas de costo/inversión, incluye esos datos en el análisis y calcula CPL (Costo Por Lead) por día.
- LECTURA PRECISA DE TABLAS Y PLANILLAS (CRITICO):
  * Lee la tabla FILA POR FILA y COLUMNA POR COLUMNA. Transcribe los números EXACTAMENTE como aparecen, sin redondear ni inventar.
  * Identifica primero los ENCABEZADOS de cada columna y respétalos. No confundas una columna con otra (ej. "costo" no es lo mismo que "leads").
  * Presta atención a separadores: en estas planillas el punto (.) suele ser separador de miles y la coma (,) el decimal (ej. "2.093.946,13" = dos millones noventa y tres mil...).
  * Si una columna del CRM se compone de varias (ej. "FIDELITY form" + "FIDELITY WhatsApp"), SUMA ambas para obtener el total del CRM y muestra el cálculo si ayuda.
  * Antes de entregar la tabla final, VERIFICA que cada valor que escribiste coincide con la celda original. Si una celda no se lee con claridad, indícalo explícitamente (ej. "valor no legible") en vez de inventar un número.
  * Si calculas una variación o diferencia, hazlo con los números exactos transcritos y muestra el resultado correcto (variación = CRM - Plataforma).
- IMPORTANTE: si la imagen es muy densa o algún número no se distingue, dilo abiertamente y pide al usuario que reenvíe la planilla como archivo CSV/Excel o una captura más nítida, en lugar de adivinar.
- Si el usuario pega datos de métricas en el chat (ej: "Meta: $1500 inversión, 45 leads" o una tabla con números):
  * EXTRAE los datos y úsalos como si fueran reales
  * CONSTRUYE gráficos y análisis igual que si vinieran de las APIs
  * ASUME que son correctos y no cuestiones su veracidad
  * Si faltan datos, PREGUNTA: "Entiendo, pero ¿qué tal el CPL? ¿Y cuántas impresiones tuviste?"
- IMPORTANTE: Si el usuario te pide análisis pero no ve datos en tu respuesta, avísale que necesita recargar la página o reenviar el archivo/datos.

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
      a.type?.includes('sheet') ||
      a.type?.includes('csv') ||
      a.type?.includes('text')
    )

    // Parse documents if present
    let documentsContext = ''
    if (hasDocuments) {
      const documentAttachments = attachments.filter((a: { type: string }) => 
        a.type?.includes('pdf') || 
        a.type?.includes('spreadsheet') || 
        a.type?.includes('excel') ||
        a.type?.includes('sheet') ||
        a.type?.includes('csv') ||
        a.type?.includes('text')
      )
      console.log('[v0] Found documents to parse:', documentAttachments.length, documentAttachments.map((a: { name?: string; type: string }) => ({ name: a.name, type: a.type })))
      try {
        documentsContext = await parseAttachments(documentAttachments as Array<{ url: string; name?: string; type?: string }>)
        console.log('[v0] Documents parsed successfully, context length:', documentsContext.length)
      } catch (error) {
        console.error('[v0] Error parsing documents:', error)
        // Fallback to listing files if parsing fails
        documentsContext = `\n\nARCHIVOS ADJUNTOS (no se pudieron parsear automáticamente):
${documentAttachments.map((a: { name?: string; type: string }, idx: number) => 
  `- Archivo ${idx + 1}: ${a.name || 'Documento'} (${a.type})`
).join('\n')}`
      }
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
                    // 'high' detail forces OpenAI to read the image at full resolution,
                    // which is critical for accurately transcribing dense numeric tables/spreadsheets
                    providerOptions: { openai: { imageDetail: 'high' } },
                  }))
                ]
              }
            }
          }
          return { role: m.role, content: m.content + documentsContext }
        })
      : [{
          role: 'user',
          content: `El cliente ha compartido un archivo con datos de seguimiento. Por favor, analiza el contenido del archivo adjunto y compáralo con las métricas de las plataformas publicitarias (Google Ads, Meta Ads). 
          
Luego genera un informe de análisis completo para ${client.nombre_del_negocio} del periodo ${periodoTexto}. Incluye:
- Comparativa entre los leads reportados en el archivo vs los leads de la plataforma
- Cálculo de variación (diferencia entre CRM y plataforma)
- Gráficos de visualización
- CSV descargable
- Informe en PDF (bloque pdf) con los datos${documentsContext}`
        }]

    // Use GPT-4o for vision (images) or when documents are present (better at data analysis)
    // Fall back to gpt-4o-mini only if neither images nor documents are present
    const modelId = hasImages || hasDocuments ? 'gpt-4o' : 'gpt-4o-mini'

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

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error('[v0] Analista stream error:', error)
        if (error instanceof Error) return error.message
        return 'Error procesando la solicitud (posible problema al leer la imagen adjunta).'
      },
    })
  } catch (error) {
    console.error('Error in analista agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}