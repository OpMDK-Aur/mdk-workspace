import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { parseISO } from 'date-fns'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'
import { parseAttachments } from '@/lib/parse-attachments'
import { fetchGhlOpportunities, fetchGhlPipelines, fetchGhlUsers } from '@/lib/revops/ghl-client'
import { analizarVentasYFacturacion, analizarFunnelPorVendedor } from '@/lib/revops/analyze'

export const maxDuration = 120

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const GOOGLE_ADS_API_VERSION = 'v23'

type DailyPoint = { date: string; spend: number; leads: number; impressions: number; clicks: number }
type ActionBreakdownItem = { label: string; count: number; ctr: number }
type CampaignPoint = {
  name: string; spend: number; leads: number; cpl: number; impressions: number; clicks: number; ctr: number
  actionsBreakdown?: ActionBreakdownItem[]
}
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

// --------------------------------------------------------------------------------
// Desglose de conversiones por tipo de acción, dentro de una campaña.
// Ej: una campaña puede generar "Leads" y "Conversaciones iniciadas" a la vez.
// El CTR es el mismo para todas las sub-filas: Meta no expone un CTR distinto
// por tipo de acción dentro de una campaña (clics/impresiones es una métrica
// de campaña completa, no por tipo de conversión) — se repite el CTR general
// de la campaña a propósito, no es un error.
// --------------------------------------------------------------------------------
const ACTION_TYPE_LABELS: Record<string, string> = {
  lead: 'Leads',
  'onsite_conversion.lead_grouped': 'Leads',
  'offsite_conversion.fb_pixel_lead': 'Leads (Pixel)',
  'onsite_conversion.messaging_conversation_started_7d': 'Conversaciones iniciadas',
  'onsite_conversion.total_messaging_connection': 'Conversaciones iniciadas',
  messaging_conversation_started_7d: 'Conversaciones iniciadas',
  omni_purchase: 'Compras',
  purchase: 'Compras',
  'offsite_conversion.fb_pixel_purchase': 'Compras (Pixel)',
  link_click: 'Clics en el enlace',
  landing_page_view: 'Vistas de landing page',
}

// Solo tipos de CONVERSIÓN real (leads, conversaciones, compras). link_click y
// landing_page_view se sacaron de acá a propósito: son métricas de tráfico,
// no un "tipo de conversión", y mezclarlas en el desglose de conversiones
// confundía el dato (una campaña de leads mostraba "488 conversiones" de
// clics junto a "49 conversiones" de leads reales, como si fueran comparables).
const DEDUPE_GROUPS: string[][] = [
  ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'],
  [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'messaging_conversation_started_7d',
  ],
  ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
]

function buildActionsBreakdown(actions: MetaAction[] | undefined, campaignCtr: number): ActionBreakdownItem[] {
  if (!actions || actions.length === 0) return []

  const valueByGroup: { label: string; count: number }[] = []
  for (const group of DEDUPE_GROUPS) {
    const values = group
      .map((type) => actions.find((a) => a.action_type === type))
      .filter(Boolean)
      .map((a) => parseInt(a!.value, 10) || 0)
    const best = values.length > 0 ? Math.max(...values) : 0
    if (best > 0) {
      valueByGroup.push({ label: ACTION_TYPE_LABELS[group[0]] || group[0], count: best })
    }
  }

  return valueByGroup
    .sort((a, b) => b.count - a.count)
    .map((item) => ({ label: item.label, count: item.count, ctr: campaignCtr }))
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
          const cCtr = cImpr > 0 ? (cClicks / cImpr) * 100 : 0
          if (row.campaign_id) campaignObjectiveById.set(row.campaign_id, row.objective || '')
          campaigns.push({
            name: row.campaign_name || 'Sin nombre',
            spend: cSpend,
            leads: cLeads,
            cpl: cLeads > 0 ? cSpend / cLeads : 0,
            impressions: cImpr,
            licks: cClicks,
            ctr: cCtr,
            actionsBreakdown: buildActionsBreakdown(row.actions, cCtr),
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
            // Google Ads no reporta un desglose de action_types como Meta;
            // el concepto de "conversiones" ya es un número único acá.
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
      .select('*, meta_ads_account_id, google_ads_customer_id, meta_ads_account_ids, google_ads_customer_ids, account_manager_ids')
      .eq('id', clientId)
      .single()

    if (!client) {
      return new Response('Client not found', { status: 404 })
    }

    // Ejecutivo/Responsable del informe = Account Manager asignado al cliente (AUTOMÁTICO, ya no hay que pedirlo)
    let ejecutivoNombre = ''
    if (client.account_manager_ids?.length > 0) {
      const { data: accountManagers } = await supabase
        .from('colaboradores')
        .select('nombre, apellido')
        .in('id', client.account_manager_ids)
      ejecutivoNombre = (accountManagers || [])
        .map((c) => `${c.nombre ?? ''} ${c.apellido ?? ''}`.trim())
        .filter(Boolean)
        .join(', ')
    }

    // Get client memoria for context
    const { data: memoria } = await supabase
      .from('cliente_memoria')
      .select('*')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Get ALL tasks touching this client, sin filtrar por estado — el informe
    // necesita ver realizadas, resolviendo, pendientes y no realizadas para
    // armar la sección "En qué trabajamos" con datos reales.
    const { data: clientTareas } = await supabase
      .from('tareas')
      .select('titulo, descripcion, estado, fecha_completada, fecha_vencimiento, created_at')
      .or(`cliente_id.eq.${clientId},cliente_ids.cs.{${clientId}}`)
      .order('created_at', { ascending: false })
      .limit(100)

    // Filter by period: una tarea "pertenece" al período si se completó, vence,
    // o se creó dentro del rango (para no perder pendientes/no-realizadas que
    // no tienen fecha_completada).
    const tareasDelPeriodo = clientTareas?.filter(t => {
      if (!effectivePeriodo?.start || !effectivePeriodo?.end) return true
      const fechas = [t.fecha_completada, t.fecha_vencimiento, t.created_at].filter(Boolean) as string[]
      return fechas.some((f) => {
        const d = f.split('T')[0]
        return d >= effectivePeriodo.start && d <= effectivePeriodo.end
      })
    }) || []

    // Comentarios de la tarjeta del cliente (cliente_memoria) que caen DENTRO
    // del período analizado — para la sección "Estrategia" de "En qué trabajamos".
    // No se usa toda la memoria histórica, solo lo que cae en el rango.
    const memoriaDelPeriodo = (memoria || []).filter((m) => {
      if (!effectivePeriodo?.start || !effectivePeriodo?.end || !m.created_at) return true
      const d = String(m.created_at).split('T')[0]
      return d >= effectivePeriodo.start && d <= effectivePeriodo.end
    })

    // Si el cliente usa GHL, orquestamos en vivo lo que sea rápido de calcular
    // (Ventas y Funnel Comercial no necesitan IA ni muestreos costosos), y
    // usamos la última auditoría completa de RevOps para lo que sí es lento
    // (Gestión en CRM: tiempos de respuesta y calidad de conversaciones,
    // que dependen de auditorías por IA — correrlas en cada mensaje del chat
    // arriesgaría timeouts).
    let revopsText = ''
    let tieneCRMConectado = false
    if (client.crm_type === 'ghl' && client.ghl_location_id && client.ghl_token) {
      tieneCRMConectado = true
      const creds = { locationId: client.ghl_location_id as string, token: client.ghl_token as string }

      // ---------- Ventas y Funnel Comercial: EN VIVO, siempre frescos ----------
      let ventasYFunnelText = ''
      try {
        const [opportunities, pipelines, usuarios] = await Promise.all([
          fetchGhlOpportunities(creds),
          fetchGhlPipelines(creds),
          fetchGhlUsers(creds),
        ])

        // Ventas y Funnel usan el MISMO criterio de período: oportunidades
        // creadas (createdAt) dentro del rango. Antes Ventas filtraba por
        // updatedAt como proxy de "fecha de venta", pero eso fallaba en
        // oportunidades ganadas y nunca vueltas a tocar (su updatedAt queda
        // congelado en el pasado y nunca cae dentro de ningún período que se
        // mida). Con el mismo criterio, Ventas y Funnel siempre coinciden.
        //
        // Se usa parseISO (no new Date directo) para createdAt: si GHL
        // devolviera alguna vez una fecha sin hora ("YYYY-MM-DD"), new Date()
        // la interpretaría en UTC y correría el día en Argentina (UTC-3).
        const opportunitiesDelPeriodo = effectivePeriodo
          ? opportunities.filter((o) => {
              const t = parseISO(o.createdAt).getTime()
              if (isNaN(t)) return false
              const desdeMs = new Date(`${effectivePeriodo.start}T00:00:00`).getTime()
              const hastaMs = new Date(`${effectivePeriodo.end}T23:59:59.999`).getTime()
              return t >= desdeMs && t <= hastaMs
            })
          : opportunities

        const ventas = analizarVentasYFacturacion(pipelines, opportunitiesDelPeriodo)
        const funnel = analizarFunnelPorVendedor(opportunitiesDelPeriodo, pipelines, usuarios)

        const ventasTexto = `- Ventas del período (oportunidades en estado Ganado): ${ventas.ventas}
- Facturación del período (suma de monto de esas oportunidades): $${ventas.facturacion.toLocaleString('es-AR')}
- Nota de método: ${ventas.supuesto_fecha}`

        let funnelTexto = '- Funnel por vendedor: sin oportunidades en el período.'
        if (funnel.filas.length > 0) {
          const header = `Etapa | ${funnel.vendedores.join(' | ')} | Total | % General`
          const filas = funnel.filas
            .map((fila) => `${fila.etapa} | ${fila.porVendedor.join(' | ')} | ${fila.total} | ${fila.pctGeneral.toFixed(0)}%`)
            .join('\n')
          funnelTexto = `- Funnel por vendedor (${funnel.totalOportunidades} oportunidades en el período):\n${header}\n${filas}`
        }

        ventasYFunnelText = `VENTAS (calculado en vivo desde GHL en este mismo momento):
${ventasTexto}

FUNNEL COMERCIAL (calculado en vivo desde GHL en este mismo momento):
${funnelTexto}`
      } catch (e) {
        console.error('[v0] Error al orquestar Ventas/Funnel en vivo desde GHL:', e)
        ventasYFunnelText = 'VENTAS y FUNNEL COMERCIAL: no se pudieron calcular en vivo en este momento (error de conexión con GHL). Preguntale al usuario si tiene los números a mano en vez de inventarlos.'
      }

      // ---------- Gestión en CRM: última auditoría completa de RevOps (no en vivo) ----------
      const { data: revopsEjecucion } = await supabase
        .from('revops_ejecuciones')
        .select('ejecutado_en, estado, score_salud, resumen')
        .eq('cliente_id', clientId)
        .eq('estado', 'ok')
        .order('ejecutado_en', { ascending: false })
        .limit(1)
        .maybeSingle()

      let gestionCrmText = 'GESTIÓN EN CRM: todavía no hay ninguna auditoría de RevOps corrida para este cliente. Si el usuario pregunta por tiempos de respuesta o calidad de conversaciones, avisale que conviene correr RevOps al menos una vez.'
      if (revopsEjecucion?.resumen) {
        const r = revopsEjecucion.resumen as any
        const fechaAuditoria = new Date(revopsEjecucion.ejecutado_en).toLocaleDateString('es-AR')
        gestionCrmText = `GESTIÓN EN CRM (según última auditoría RevOps del ${fechaAuditoria}, score de salud ${revopsEjecucion.score_salud ?? '—'}/100 — esto NO es en vivo, es la última vez que corrió RevOps):
- Tiempo de respuesta: promedio ${r?.tiempos_respuesta?.promedio_primera_respuesta_min != null ? `${Math.round(r.tiempos_respuesta.promedio_primera_respuesta_min)} min hábiles` : 'sin datos suficientes'} para la primera respuesta.
- Registro de valor: ${r?.oportunidades?.pct_sin_monto != null ? `${Math.round(r.oportunidades.pct_sin_monto * 100)}% de las oportunidades abiertas sin monto cargado` : 'sin datos'}.
- Tiempo por etapa: ${r?.embudo?.estancadas_30 ?? 0} oportunidades estancadas 30d+, ${r?.embudo?.estancadas_90 ?? 0} estancadas 90d+.
- Calidad de respuesta: score promedio de conversaciones auditadas ${r?.conversaciones_calidad?.promedio_score != null ? `${r.conversaciones_calidad.promedio_score.toFixed(1)}/10` : 'sin datos'}.
Si esta fecha es muy vieja respecto al período que se está analizando, avisale al usuario en UNA línea que conviene correr RevOps de nuevo para actualizar este dato puntual, pero usalo igual como referencia — no lo omitas ni lo preguntes de nuevo.`
      }

      revopsText = `${ventasYFunnelText}\n\n${gestionCrmText}\n\nUsá Ventas y Funnel Comercial (en vivo, siempre confiables) y Gestión en CRM (última auditoría, puede tener fecha vieja) como AUTOMÁTICO — NUNCA se los pidas al usuario si estos datos están disponibles acá arriba.`
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
    const clienteMemoriaText = memoriaDelPeriodo.length > 0
      ? memoriaDelPeriodo.map(m => `- ${m.contenido}`).join('\n')
      : 'Sin comentarios en la tarjeta del cliente dentro de este período específico.'
    const tareasText = tareasDelPeriodo.length > 0
      ? tareasDelPeriodo.map(t => `- [${t.estado}] ${t.titulo}${t.descripcion ? `: ${t.descripcion.substring(0, 150)}` : ''}`).join('\n')
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
  const MAX_DIAS_DETALLE = 45
  const diasOmitidos = Math.max(0, m.daily.length - MAX_DIAS_DETALLE)
  const diasAMostrar = diasOmitidos > 0 ? m.daily.slice(diasOmitidos) : m.daily
  const resumenOmitidos = diasOmitidos > 0
    ? (() => {
        const omitidos = m.daily.slice(0, diasOmitidos)
        const totalSpend = omitidos.reduce((a, d) => a + d.spend, 0)
        const totalLeads = omitidos.reduce((a, d) => a + d.leads, 0)
        return `    [Resumen de los ${diasOmitidos} días anteriores, no desglosados uno por uno para no saturar el análisis: ${totalLeads} leads | $${totalSpend.toFixed(2)} inversión total]\n`
      })()
    : ''
  const rows = diasAMostrar.map(d =>
    `    ${d.date}: ${d.leads} leads | $${d.spend.toFixed(2)} inversión | ${d.impressions.toLocaleString()} impresiones | ${d.clicks.toLocaleString()} clics`
  ).join('\n')
  return `• ${m.accountName} (${m.account}) - ${m.platform}:\n${resumenOmitidos}${rows}`
}).join('\n')}

DESGLOSE POR CAMPAÑA (SOLO campañas con conversiones > 0 — las de 0 NO se listan, con desglose por tipo de acción cuando aplica):
${metricsByAccount.map(m => {
  const campanasConConversiones = (m.campaigns || []).filter(c => c.leads > 0)
  if (campanasConConversiones.length === 0) {
    return `• ${m.accountName} (${m.account}) - ${m.platform}: ninguna campaña con conversiones > 0 en el período`
  }
  const rows = campanasConConversiones
    .sort((a, b) => b.spend - a.spend)
    .map(c => {
      const main = `    "${c.name}": $${c.spend.toFixed(2)} inversión | ${c.leads} conversiones | CPL $${c.cpl.toFixed(2)} | CTR ${c.ctr.toFixed(2)}%`
      const breakdown = (c.actionsBreakdown || [])
        .filter((b) => c.actionsBreakdown!.length > 1) // si hay un solo tipo de acción, no aporta desglosar
        .map(b => `        ↳ ${b.label}: ${b.count} conversiones | CTR ${b.ctr.toFixed(2)}% (mismo CTR de la campaña — Meta no lo separa por tipo de acción)`)
        .join('\n')
      return breakdown ? `${main}\n${breakdown}` : main
    }).join('\n')
  return `• ${m.accountName} (${m.account}) - ${m.platform}:\n${rows}`
}).join('\n')}`
    }

    const periodoTexto = effectivePeriodo?.start && effectivePeriodo?.end 
      ? (() => {
          // Se agrega la hora explícita (T00:00:00) al parsear: new Date()
          // sobre un string "YYYY-MM-DD" sin hora se interpreta en UTC, lo
          // que en Argentina (UTC-3) corre la fecha un día para atrás.
          const start = parseISO(effectivePeriodo.start)
          const end = parseISO(effectivePeriodo.end)
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

    // Guía de contenido que el agente debe entregar. YA NO se genera un PDF/archivo:
    // la salida es texto en el chat, listo para copiar y pegar en la plantilla de
    // Claude Design. El nivel de profundidad sigue dependiendo del plan del cliente.
    const guiaInformes = `
ESTRUCTURA DE LA INFORMACIÓN QUE DEBÉS ENTREGAR:
Tu única salida es texto estructurado en el chat — NO generás ningún archivo ni PDF. El usuario copia este texto directamente a la plantilla de Claude Design. Por eso el formato debe ser limpio: los títulos de sección tal cual figuran abajo, un dato por línea, tablas markdown reales cuando corresponda, sin relleno narrativo innecesario.

El plan detectado para este cliente es "${planInforme}" (plan crudo: "${client.plan || 'sin definir'}"). El nivel de profundidad depende del plan:

REGLA DE PRIORIDAD MÁXIMA: la estructura de abajo (Esencial o Estratégico) se aplica en CADA mensaje según el plan real del cliente indicado arriba, sin importar qué estructura se usó en mensajes anteriores de esta misma conversación. Si en un turno anterior de este chat se armó un informe con la estructura equivocada (por ejemplo, Esencial para un cliente que en realidad es Estratégico), corregilo en el siguiente mensaje sin que haga falta que el usuario te lo pida — nunca repitas una estructura incorrecta solo porque ya se usó antes en la conversación.

REGLA DE PRIORIDAD MÁXIMA (período): el período que mostrás en la portada y en cualquier parte del informe es SIEMPRE el que figura en "Periodo seleccionado" dentro de CONTEXTO DEL CLIENTE de ESTE mensaje — nunca reutilices ni repitas el período (ni las fechas, ni el texto) que usaste en un mensaje anterior de esta misma conversación, aunque se parezca. Si el período de este mensaje es distinto al de un informe anterior en el chat, el nuevo informe debe reflejar el período nuevo en todos sus datos y en el texto de la portada.

Cada campo está marcado como:
- (AUTOMÁTICO) → sale de las métricas/tareas/memoria/RevOps ya incluidas en este prompt. Nunca lo dejes vacío si el dato está disponible ahí.
- (PREGUNTAR) → no viene de ninguna fuente conectada a este chat. Preguntalo directo y una sola vez; si el usuario no lo tiene, avanzá sin ese dato en vez de insistir.
- (OMITIR SI FALTA) → si no hay dato disponible, no lo preguntes ni lo menciones — simplemente no aparece en el informe. Nunca genera una pregunta al usuario.

REGLA CRÍTICA: nunca reproduzcas corchetes de plantilla (ej. "[N]", "$[X]") en tu respuesta — siempre el dato real o, si es (OMITIR SI FALTA), directamente ausente.

▶ PLAN ESENCIAL:
- Portada: Cliente (AUTOMÁTICO) · Período (AUTOMÁTICO) · Responsable = Account Manager asignado (AUTOMÁTICO; si no hay ninguno asignado, PREGUNTAR).
- RESUMEN DEL PERÍODO:
  - Objetivo de la pauta (PREGUNTAR la primera vez en la conversación — ejemplo a incluir en la pregunta: "Ej: generar leads a un CPL ≤ $X, o cerrar X ventas en el mes").
  - Conclusión general, 2-3 líneas (AUTOMÁTICO, combinando métricas + objetivo si está).
  - Leads generados (AUTOMÁTICO) con su objetivo (mismo dato de arriba). CPL promedio (AUTOMÁTICO) con su objetivo. Cumplimiento del objetivo (AUTOMÁTICO si hay objetivo cargado, si no OMITIR SIN preguntarlo de nuevo).
- RESULTADOS DE CAMPAÑAS: Inversión total, Leads, CPL promedio, Variación vs período anterior (todo AUTOMÁTICO). Para cada cuenta publicitaria (ver DESGLOSE POR CAMPAÑA en las métricas), mostrá:
1. Un encabezado de grupo con el formato "**[Plataforma] | [Nombre de la cuenta]**" (ej. "**Meta Ads | ADT - CM NUTRIMENTAL**") — SIN ningún ID entre paréntesis.
2. Debajo, una tabla con las CAMPAÑAS REALES de esa cuenta (los nombres entre comillas en DESGLOSE POR CAMPAÑA, NUNCA el nombre de la cuenta): Campaña | Inversión | Conversiones | CPL | CTR, SOLO campañas con conversiones > 0, con desglose por tipo de acción cuando una campaña tenga más de un tipo. Si esa cuenta tiene 3 campañas con conversiones, la tabla tiene 3 filas de campaña — nunca colapses todas las campañas de una cuenta en una sola fila.
3. Una fila "Total [Nombre de la cuenta]" al final de esa tabla, sumando sus propias campañas.
Repetí 1-3 para cada cuenta. Al final de todas las cuentas de la misma plataforma, agregá una fila o línea "Total [Plataforma]" con la suma de todas las cuentas de esa plataforma.
- ACCIONES REALIZADAS: Cambios en campañas, Optimizaciones aplicadas, Tests ejecutados con resultado cuantitativo — todo AUTOMÁTICO cruzando con TAREAS DEL PERIODO.
- ANÁLISIS DEL FUNNEL (SÍNTESIS): si el cliente tiene CRM conectado (ver más abajo), usá los datos de RevOps disponibles (leads en CRM, oportunidades del período) — AUTOMÁTICO. Si no tiene CRM conectado, PREGUNTAR una sola vez si quiere pasar el dato manualmente; si no lo tiene a mano, OMITIR esta sección entera sin insistir.
- QUÉ FUNCIONÓ / QUÉ NO: mensajes/audiencias con mejor y peor resultado (AUTOMÁTICO si se infiere de las campañas con mejor/peor CPL o CTR; si no hay señal clara, OMITIR SIN preguntarlo).
- PLAN DEL MES SIGUIENTE: qué se va a ajustar, qué se va a testear, requerimientos al cliente — PREGUNTAR una sola vez, avanzar sin esto si no hay respuesta.

▶ PLAN ESTRATÉGICO:
- Portada: Cliente (AUTOMÁTICO) · Período (AUTOMÁTICO) · Ejecutivo = Account Manager asignado (AUTOMÁTICO; si no hay ninguno, PREGUNTAR).
- RESUMEN EJECUTIVO:
  - Leads, CPL, Inversión (AUTOMÁTICO, de plataformas).
  - Ventas (AUTOMÁTICO si hay CRM conectado — ver VENTAS en los datos de RevOps más abajo. Si NO hay CRM conectado, PREGUNTAR: "¿Cuántas ventas [oportunidades Ganado] hubo en el período?"; si no la tiene, OMITIR el dato de Ventas y todo lo que dependa de él — Impacto Económico incluido — en vez de insistir).
  - Objetivo del período (PREGUNTAR la primera vez — ejemplo a incluir en la pregunta: "Ej: 50 leads diarios, o 60 ventas en el mes").
  - Contexto del mes (OMITIR SI FALTA — nunca lo preguntes explícitamente. Completalo solo si hay algo relevante en tareas/comentarios del período; si no hay nada, no aparece en el informe y no se menciona que falta).
  - Conclusión general (AUTOMÁTICO, combinando lo anterior).
  - Cumplimiento (AUTOMÁTICO si hay objetivo cargado, si no OMITIR SIN preguntar de nuevo).
- EN QUÉ TRABAJAMOS (solo 2 pilares, no 4):
  - Estrategia (AUTOMÁTICO — SOLO de los comentarios de la tarjeta del cliente que caen DENTRO del período, ver HISTORIAL Y CONTEXTO DEL CLIENTE más abajo, ya viene filtrado al período. Si no hay ningún comentario en el período, decilo en una línea, no lo inventes).
  - Operaciones (AUTOMÁTICO — SOLO de TAREAS DEL PERIODO, ya viene filtrado. Resumí qué se hizo, no repitas la lista cruda).
- PERFORMANCE DE CAMPAÑAS: Inversión total, Leads, CPL promedio, Ventas (mismo dato del Resumen Ejecutivo) — AUTOMÁTICO. Tabla — Campaña | Inversión | Conversiones | CPL | CTR, SOLO campañas con conversiones > 0 (nunca listes las de 0), con desglose por tipo de acción cuando una campaña tenga más de un tipo (ver DESGLOSE POR CAMPAÑA). Si hay más de una cuenta activa en la misma plataforma, separá por cuenta.
- ACCIONES REALIZADAS: Cambios, Optimizaciones, Tests con resultado cuantitativo — AUTOMÁTICO cruzando con TAREAS DEL PERIODO.
- FUNNEL COMERCIAL: AUTOMÁTICO si hay CRM conectado (usá el bloque FUNNEL COMERCIAL de los datos de RevOps: tabla Etapa | [una columna por vendedor] | Total | % General). Si NO hay CRM conectado, PREGUNTAR una sola vez: "¿Podés pasarme el funnel del período por vendedor (Leads, Contactado, Presupuesto, Ganado)?"; si no lo tiene, OMITIR toda la sección sin insistir. NUNCA inventes números de funnel.
- GESTIÓN EN CRM: AUTOMÁTICO si hay CRM conectado (usá el bloque GESTIÓN EN CRM de RevOps: Tiempo de respuesta, Registro de valor, Tiempo por etapa, Calidad de respuesta). Si no hay CRM conectado, OMITIR toda la sección sin preguntar (ya se avisó una vez en Funnel Comercial que no hay CRM, no hace falta repetir la pregunta).
- IMPACTO ECONÓMICO: Costo por venta estimado = Inversión total / Ventas del período (AUTOMÁTICO si hay dato de Ventas). Inversión vs Facturación = Inversión total / Facturación del período (AUTOMÁTICO si hay CRM conectado, usando la facturación de VENTAS en RevOps; si no hay CRM, PREGUNTAR la facturación una sola vez, si no la tiene OMITIR esta sección entera).

REGLA CRÍTICA SOBRE CAMPAÑAS VS. CUENTAS: en las métricas de este prompt hay dos secciones distintas y NO deben mezclarse nunca:
- "DESGLOSE POR CUENTA" (dentro de METRICAS DE CUENTAS PUBLICITARIAS): un resumen por CUENTA publicitaria completa, con el ID de la cuenta entre paréntesis (ej. "ADT - CM NUTRIMENTAL (1043470857039136)"). Esto es SOLO para el total global — NUNCA lo uses como fila de una tabla de campañas.
- "DESGLOSE POR CAMPAÑA": acá están las CAMPAÑAS reales, una por una, con su nombre entre comillas y SIN ningún ID (ej. "Nombre de la campaña": $X inversión | ...). Esta es la ÚNICA fuente válida para las tablas de "Performance de Campañas" / "Resultados de Campañas".
El ID entre paréntesis que aparece en DESGLOSE POR CUENTA es el ID de la CUENTA, no de una campaña — nunca lo incluyas en una fila de la tabla de campañas, ni siquiera como referencia.
Si una cuenta tiene varias campañas con conversiones > 0, la tabla debe tener una fila por CADA campaña, no una fila por cuenta. Si te encontrás escribiendo una sola fila por cuenta cuando esa cuenta tiene más de una campaña activa, es un error — releé DESGLOSE POR CAMPAÑA y desglosá cada una.

Reglas comunes a ambos planes:
- Los tests SIEMPRE con resultado cuantitativo (ej. "+20% CTR").
- Tono profesional, directo. La sección de CRM es constructiva, nunca acusatoria.
- Nunca preguntes dos veces por el mismo dato en la misma conversación. Si ya preguntaste y el usuario no respondió o dijo que no lo tiene, avanzá sin ese dato (OMITIR), no vuelvas a insistir más adelante.
- Nunca pidas capturas de anuncios ni imágenes de creativos — esa sección ya no forma parte del informe.
`

    const systemPrompt = `${agentConfig.system_prompt}

Eres un analista de performance digital experto y conversacional. Trabajas como un asistente de chat libre: respondes exactamente lo que el usuario te pide, ya sea una pregunta puntual, un análisis parcial, una comparación o un informe completo. NO generes siempre un informe completo a menos que el usuario lo pida explícitamente.

Tu salida es SIEMPRE texto en el chat — nunca generás un archivo ni un PDF. El usuario copia tu respuesta directamente a una plantilla de Claude Design ya armada.

CONTEXTO DEL CLIENTE (úsalo como referencia cuando sea relevante):
- Cliente: ${client.nombre_del_negocio}
- Plan: ${client.plan || 'No especificado'}
- Estructura de informe que aplica: ${planInforme}
- Periodo seleccionado: ${periodoTexto}
- Ejecutivo/Responsable (Account Manager asignado): ${ejecutivoNombre || 'No hay ningún Account Manager asignado a este cliente en el sistema — pedíselo al usuario.'}
- CRM conectado: ${tieneCRMConectado ? 'Sí, GoHighLevel' : 'No — Ventas, Funnel Comercial y Gestión en CRM van a tener que pedirse manualmente, y si el usuario no los tiene, esas secciones se omiten (ver guía de abajo).'}

${guiaInformes}

HISTORIAL Y CONTEXTO DEL CLIENTE (comentarios de la tarjeta del cliente DENTRO del período analizado):
${clienteMemoriaText}

TAREAS DEL PERIODO (todos los estados: realizada, resolviendo, pendiente, no_realizado):
${tareasText}
Usá esta lista completa (no solo las realizadas) para construir "Operaciones" en "En qué trabajamos" y "Acciones Realizadas": clasificá según corresponda, y si hay tareas "pendiente" o "no_realizado" relevantes, mencionalas como contexto en vez de ignorarlas.

${revopsText ? `DATOS DE CRM (desde RevOps) — Ventas, Funnel Comercial, Gestión en CRM:
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
- Si el usuario pide el informe completo, estructuralo siguiendo la guía de arriba según el plan del cliente. Preguntá SOLO los campos marcados (PREGUNTAR) que todavía no tengas, y hacelo una sola vez por campo en la conversación — no repitas la pregunta ni bloquees el resto del informe esperando esa respuesta si el usuario ya te dijo que no la tiene.
- Los campos (OMITIR SI FALTA) nunca generan una pregunta: si no hay dato, esa sección o línea simplemente no aparece en el informe.

VERIFICACIÓN ANTES DE RESPONDER (hacé esto siempre, en silencio, antes de enviar el mensaje):
- Si el cliente tiene CRM conectado y el bloque VENTAS/FUNNEL COMERCIAL de este prompt tiene datos, y tu respuesta es un informe completo de Plan Estratégico, confirmá que Ventas, Funnel Comercial, Gestión en CRM e Impacto Económico estén efectivamente incluidos — si armaste el informe y falta alguna de estas secciones sin que el campo esté vacío en los datos, es un error tuyo: corregilo antes de responder, no lo envíes incompleto.
- Si vas a insertar un nombre de campaña/cuenta en una tabla markdown, revisá que no contenga "|" sin escapar (ver regla de FORMATO DEL TEXTO).
- Si un total no coincide con la suma de sus partes (ej. TOTAL de la tabla vs. la suma de las filas), recalculalo antes de mostrarlo.
- Si una métrica es anómala (CTR > 100%, CPL en $0, ROAS negativo), mencionalo como algo a revisar en vez de mostrarlo sin comentario.
- Nunca omitas una sección completa en silencio si los datos para esa sección SÍ están disponibles en este prompt — omitir sin dato disponible es un error, no una decisión de formato.

FORMATO DEL TEXTO (para que se pueda copiar y pegar limpio a Claude Design):
- Números KPI (Leads/CPL/Ventas/Inversión, etc.): una línea en negrita por cada uno, sin viñeta — ej. "**Leads:** 1453".
- Tablas (campañas, funnel): SIEMPRE tabla markdown real con pipes "|", nunca datos sueltos en viñetas.
- Los nombres de campaña o de cuenta publicitaria pueden contener el carácter "|" (ej. "MDK | NTI // Cuenta de respaldo"). Como las tablas markdown usan "|" como separador de columna, ANTES de insertar un nombre en una celda de tabla, reemplazá cualquier "|" que contenga por "/" (ej. "MDK / NTI // Cuenta de respaldo"). Si no hacés esto, la fila se corre y la tabla queda rota — ya pasó antes.
- El resto del contenido narrativo (objetivo, conclusión, acciones) puede ir en viñetas o párrafos normales.
- Destacá números importantes en **negrita**. Sé claro y conciso.

FORMATO DE NÚMEROS (Argentina):
- Moneda: $1.234.567,89 — punto para miles, coma para decimales. NUNCA formato inglés ($1,234,567.89).
- Porcentajes: 12,5% — 1 decimal, coma.
- Números enteros grandes (leads, impresiones): 1.234.567 — punto para miles.
- Ratios (CPC, CPL, CPM): 2 decimales con coma. Ej: $85,40.
- ROAS: 2 decimales con "x". Ej: 3,42x.

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

Para generar ARCHIVOS descargables (CSV de datos), usa un bloque de codigo con la palabra file:

` + "```" + `file
{"name":"metricas-mayo-2026.csv","type":"text/csv","content":"Plataforma,Inversion,Leads,CPL\\nMeta Ads,1500,45,33.33\\nGoogle Ads,2300,62,37.10"}
` + "```" + `

Para generar IMAGENES (banners, gráficos visuales, ilustraciones), usa un bloque de codigo con la palabra image y describe lo que quieres generar:
  
  ` + "```" + `image
  {"prompt":"Descripcion detallada en ingles de la imagen a generar, estilo profesional para reporte de marketing","alt":"Texto alternativo descriptivo"}
  ` + "```" + `

REGLAS DE VISUALIZACION:
- Usa gráficos cuando compares números entre plataformas, periodos o categorías.
- No necesitas especificar colores: las gráficas usan automáticamente la paleta del sistema. Especifica siempre el campo "format" correcto ("currency", "percent" o "number") para que los valores se muestren bien.
- Usa "pie" para distribución/proporción, "bar" para comparar categorías, "line"/"area" para tendencias en el tiempo.
- Ofrece un CSV descargable cuando el usuario pida exportar datos.

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

FUERA DE ALCANCE:
Si te piden algo que no es análisis/reporte de datos de pauta o CRM (ej. editar una campaña, mandar un mail, gestionar accesos), respondé:
"Mi especialidad es analizar los datos de performance y CRM del cliente. Para [lo que pidieron], te recomiendo hacerlo directamente en la plataforma correspondiente o pedírselo al equipo indicado. ¿Hay algo sobre las métricas o el CRM de este cliente en lo que pueda ayudarte?"

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
- CSV descargable${documentsContext}`
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
        console.error('[v0] Analista stream error (raw):', error)
        if (error instanceof Error) {
          console.error('[v0] Analista stream error message:', error.message)
          return error.message
        }
        if (typeof error === 'string') return error
        try {
          const serialized = JSON.stringify(error)
          console.error('[v0] Analista stream error (serialized):', serialized)
          return `Error del modelo: ${serialized.slice(0, 300)}`
        } catch {
          return `Error procesando la solicitud (tipo no serializable: ${Object.prototype.toString.call(error)}). Revisá los logs de Vercel para el detalle completo.`
        }
      },
    })
  } catch (error) {
    console.error('Error in analista agent:', error)
    return new Response('Internal error', { status: 500 })
  }
}
