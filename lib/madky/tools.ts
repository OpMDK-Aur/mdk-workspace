import { tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types for tool responses
// ---------------------------------------------------------------------------

interface MetaAdsResponse {
  platform: 'meta'
  account_id: string
  date_range: { start: string; end: string }
  campaigns: Array<{
    id: string
    name: string
    objective: string
    impressions: number
    clicks: number
    spend: number
    leads: number
    cpl: number
    ctr: number
    cpc: number
    lead_type: string
  }>
  campaign_types: Array<{
    type: string
    spend: number
    leads: number
    percentage: number
  }>
  totals: {
    impressions: number
    clicks: number
    spend: number
    leads: number
    ctr: number
    cpc: number
    cpl: number
  }
  error?: string
}

interface GoogleAdsResponse {
  platform: 'google'
  customer_id: string
  date_range: { start: string; end: string }
  campaigns: Array<{
    id: string
    name: string
    status: string
    advertising_channel_type: string
    channel_label: string
    budget: number
    impressions: number
    clicks: number
    spend: number
    leads: number
    ctr: number
    cpc: number
    cpl: number
  }>
  campaign_types: Array<{
    type: string
    label: string
    spend: number
    leads: number
    percentage: number
  }>
  totals: {
    impressions: number
    clicks: number
    spend: number
    leads: number
    ctr: number
    cpc: number
    cpl: number
  }
  error?: string
}

interface CRMOpportunitiesResponse {
  opportunities: Array<{
    id: string
    name: string
    monetaryValue: number | null
    status: string
    source: string | null
    contact: {
      name: string
      email: string | null
      phone: string | null
    } | null
    createdAt: string
  }>
  total: number
  totalUnfiltered: number
  error?: string
}

interface CRMContactsResponse {
  contacts: Array<{
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    source: string | null
    tags: string[]
    dateAdded: string | null
  }>
  total: number
  totalUnfiltered: number
  error?: string
}

interface ClientInfoResponse {
  client: {
    id: string
    business_name: string
    plan: string | null
    status: string
    monthly_fee: number | null
    percentage_fee: number | null
    currency: string
  }
  platforms: {
    meta_ads: {
      connected: boolean
      account_id: string | null
      account_name: string | null
    }
    google_ads: {
      connected: boolean
      customer_id: string | null
      account_name: string | null
    }
    crm: {
      connected: boolean
      type: string | null
      location_id: string | null
    }
  }
  error?: string
}

// ---------------------------------------------------------------------------
// Helper to build internal API URLs
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  // In server context, we need the full URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

// ---------------------------------------------------------------------------
// Madky Tools Definition
// ---------------------------------------------------------------------------

export const madkyTools = {
  /**
   * Get Meta Ads (Facebook/Instagram) metrics for a client
   */
  getMetaAdsMetrics: tool({
    description: 'Obtiene métricas de campañas de Meta Ads (Facebook/Instagram) para un cliente. Usa esta herramienta cuando el usuario pregunte sobre rendimiento de Facebook, Instagram, o Meta Ads.',
    parameters: z.object({
      accountId: z.string().describe('ID de cuenta de Meta Ads (sin el prefijo act_)'),
      dateRange: z.enum(['last_7d', 'last_14d', 'last_30d', 'monthly', 'yearly']).optional().default('last_30d').describe('Período de tiempo para las métricas'),
    }),
    execute: async ({ accountId, dateRange }): Promise<MetaAdsResponse> => {
      try {
        // Directly call Meta API instead of internal API to avoid auth issues
        const accessToken = process.env.META_ADS_ACCESS_TOKEN
        if (!accessToken) {
          return { error: 'META_ADS_ACCESS_TOKEN no está configurado' } as MetaAdsResponse
        }
        
        const cleanAccountId = accountId.replace(/^act_/, '')
        const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
        const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`
        
        // Calculate date range
        const now = new Date()
        let since: string, until: string
        const localDateString = (d: Date) => d.toISOString().split('T')[0]
        
        switch (dateRange) {
          case 'last_7d': {
            const start = new Date(now); start.setDate(now.getDate() - 7)
            since = localDateString(start); until = localDateString(now)
            break
          }
          case 'last_14d': {
            const start = new Date(now); start.setDate(now.getDate() - 14)
            since = localDateString(start); until = localDateString(now)
            break
          }
          case 'monthly': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1)
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
            since = localDateString(start); until = localDateString(end)
            break
          }
          case 'yearly': {
            const start = new Date(now.getFullYear(), 0, 1)
            const end = new Date(now.getFullYear(), 11, 31)
            since = localDateString(start); until = localDateString(end)
            break
          }
          default: { // last_30d
            const start = new Date(now); start.setDate(now.getDate() - 30)
            since = localDateString(start); until = localDateString(now)
          }
        }
        
        const fields = 'campaign_id,campaign_name,objective,impressions,clicks,spend,ctr,cpc,actions'
        const url = `${META_BASE_URL}/act_${cleanAccountId}/insights?${new URLSearchParams({
          access_token: accessToken,
          level: 'campaign',
          fields,
          time_range: JSON.stringify({ since, until }),
          limit: '500',
        })}`
        
        const res = await fetch(url)
        
        if (!res.ok) {
          const text = await res.text()
          return { error: `Meta API error: ${text.slice(0, 200)}` } as MetaAdsResponse
        }
        
        const json = await res.json()
        
        if (json.error) {
          // Check for OAuth/checkpoint errors
          if (json.error.code === 190 || json.error.message?.includes('log in to')) {
            return { error: 'El token de Meta Ads ha expirado. Es necesario renovar el META_ADS_ACCESS_TOKEN desde Meta Business Suite.' } as MetaAdsResponse
          }
          return { error: `Meta API: ${json.error.message}` } as MetaAdsResponse
        }
        
        const rows = json.data || []
        
        // Process campaigns
        const campaigns = rows.map((row: any) => {
          const spend = parseFloat(row.spend || '0') || 0
          const actions = row.actions || []
          const leadTypes = ['lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']
          const leadAction = actions.find((a: any) => leadTypes.includes(a.action_type))
          const leads = leadAction ? Math.round(parseFloat(leadAction.value) || 0) : 0
          const cpl = leads > 0 && spend > 0 ? spend / leads : 0
          
          return {
            id: row.campaign_id,
            name: row.campaign_name,
            objective: row.objective || '',
            impressions: Math.round(parseFloat(row.impressions || '0')) || 0,
            clicks: Math.round(parseFloat(row.clicks || '0')) || 0,
            spend,
            leads,
            cpl,
            ctr: parseFloat(row.ctr || '0') || 0,
            cpc: parseFloat(row.cpc || '0') || 0,
            lead_type: leads > 0 ? 'Lead' : 'Resultado',
          }
        })
        
        // Calculate totals
        const totals = campaigns.reduce(
          (acc: any, c: any) => {
            acc.impressions += c.impressions
            acc.clicks += c.clicks
            acc.spend += c.spend
            acc.leads += c.leads
            return acc
          },
          { impressions: 0, clicks: 0, spend: 0, leads: 0 }
        )
        
        return {
          platform: 'meta',
          account_id: cleanAccountId,
          date_range: { start: since, end: until },
          campaigns,
          campaign_types: [],
          totals: {
            ...totals,
            ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
            cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
            cpl: totals.leads > 0 ? totals.spend / totals.leads : 0,
          },
        }
      } catch (error) {
        return { error: `Error al consultar Meta Ads: ${error}` } as MetaAdsResponse
      }
    },
  }),

  /**
   * Get Google Ads metrics for a client
   */
  getGoogleAdsMetrics: tool({
    description: 'Obtiene métricas de campañas de Google Ads para un cliente. Usa esta herramienta cuando el usuario pregunte sobre rendimiento de Google Ads, Search, Display, YouTube, o Performance Max.',
    parameters: z.object({
      customerId: z.string().describe('ID de cliente de Google Ads (con o sin guiones)'),
      dateRange: z.enum(['last_7d', 'last_14d', 'last_30d', 'monthly', 'yearly']).optional().default('last_30d').describe('Período de tiempo para las métricas'),
    }),
    execute: async ({ customerId, dateRange }): Promise<GoogleAdsResponse> => {
      try {
        const baseUrl = getBaseUrl()
        const url = `${baseUrl}/api/ads/google?customer_id=${customerId}&date_range=${dateRange}`
        
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })
        
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          return { error: error.error || `Error ${res.status}` } as GoogleAdsResponse
        }
        
        return await res.json()
      } catch (error) {
        return { error: `Error al consultar Google Ads: ${error}` } as GoogleAdsResponse
      }
    },
  }),

  /**
   * Get CRM opportunities from Go High Level
   */
  getCRMOpportunities: tool({
    description: 'Obtiene oportunidades del CRM (Go High Level). Usa esta herramienta cuando el usuario pregunte sobre oportunidades, ventas, pipeline, o deals del CRM.',
    parameters: z.object({
      clientId: z.string().describe('ID del cliente en el sistema'),
      startDate: z.string().optional().describe('Fecha de inicio en formato YYYY-MM-DD'),
      endDate: z.string().optional().describe('Fecha de fin en formato YYYY-MM-DD'),
    }),
    execute: async ({ clientId, startDate, endDate }): Promise<CRMOpportunitiesResponse> => {
      try {
        const baseUrl = getBaseUrl()
        let url = `${baseUrl}/api/ghl/opportunities?client_id=${clientId}`
        if (startDate) url += `&startDate=${startDate}`
        if (endDate) url += `&endDate=${endDate}`
        
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })
        
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          return { error: error.error || `Error ${res.status}` } as CRMOpportunitiesResponse
        }
        
        return await res.json()
      } catch (error) {
        return { error: `Error al consultar oportunidades: ${error}` } as CRMOpportunitiesResponse
      }
    },
  }),

  /**
   * Get CRM contacts from Go High Level
   */
  getCRMContacts: tool({
    description: 'Obtiene contactos del CRM (Go High Level). Usa esta herramienta cuando el usuario pregunte sobre contactos, leads, o cantidad de personas en el CRM.',
    parameters: z.object({
      clientId: z.string().describe('ID del cliente en el sistema'),
      startDate: z.string().optional().describe('Fecha de inicio en formato YYYY-MM-DD'),
      endDate: z.string().optional().describe('Fecha de fin en formato YYYY-MM-DD'),
    }),
    execute: async ({ clientId, startDate, endDate }): Promise<CRMContactsResponse> => {
      try {
        const baseUrl = getBaseUrl()
        let url = `${baseUrl}/api/ghl/contacts?client_id=${clientId}`
        if (startDate) url += `&startDate=${startDate}`
        if (endDate) url += `&endDate=${endDate}`
        
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })
        
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          return { error: error.error || `Error ${res.status}` } as CRMContactsResponse
        }
        
        return await res.json()
      } catch (error) {
        return { error: `Error al consultar contactos: ${error}` } as CRMContactsResponse
      }
    },
  }),

  /**
   * Get client information including connected platforms
   */
  getClientInfo: tool({
    description: 'Obtiene información completa del cliente incluyendo plataformas conectadas (Meta Ads, Google Ads, CRM). Usa esta herramienta al inicio de la conversación o cuando necesites saber qué plataformas tiene conectadas el cliente.',
    parameters: z.object({
      clientId: z.string().describe('ID del cliente en el sistema'),
    }),
    execute: async ({ clientId }): Promise<ClientInfoResponse> => {
      try {
        const supabase = await createClient()
        
        const { data: client, error } = await supabase
          .from('clients')
          .select(`
            id,
            business_name,
            plan,
            status,
            monthly_fee,
            percentage_fee,
            currency,
            meta_ads_id,
            meta_ads_name,
            google_ads_id,
            google_ads_name,
            crm_type,
            ghl_location_id,
            ghl_token
          `)
          .eq('id', clientId)
          .single()
        
        if (error || !client) {
          return { error: 'Cliente no encontrado' } as ClientInfoResponse
        }
        
        return {
          client: {
            id: client.id,
            business_name: client.business_name,
            plan: client.plan,
            status: client.status,
            monthly_fee: client.monthly_fee,
            percentage_fee: client.percentage_fee,
            currency: client.currency || 'ARS',
          },
          platforms: {
            meta_ads: {
              connected: Boolean(client.meta_ads_id),
              account_id: client.meta_ads_id,
              account_name: client.meta_ads_name,
            },
            google_ads: {
              connected: Boolean(client.google_ads_id),
              customer_id: client.google_ads_id,
              account_name: client.google_ads_name,
            },
            crm: {
              connected: Boolean(client.ghl_location_id && client.ghl_token),
              type: client.crm_type,
              location_id: client.ghl_location_id,
            },
          },
        }
      } catch (error) {
        return { error: `Error al obtener info del cliente: ${error}` } as ClientInfoResponse
      }
    },
  }),
}

/**
   * Create a new task with context from chat
   */
  createTask: tool({
    description: 'Crea una nueva tarea en el sistema. Usa esta herramienta cuando el usuario pida crear una tarea, solicite un trabajo, reporte un problema, o necesite que se haga algo. Incluye un resumen del contexto del chat como primer comentario.',
    parameters: z.object({
      titulo: z.string().describe('Título breve y descriptivo de la tarea'),
      descripcion: z.string().describe('Descripción detallada de lo que se necesita hacer'),
      clienteId: z.string().describe('ID del cliente relacionado con la tarea'),
      prioridad: z.enum(['alta', 'media', 'baja']).optional().default('media').describe('Prioridad de la tarea'),
      contextoChat: z.string().describe('Resumen del contexto de la conversación que llevó a crear esta tarea. Incluye los puntos clave discutidos, el problema identificado, y cualquier información relevante del chat.'),
      tipoTareaSugerido: z.string().optional().describe('Nombre del tipo de tarea sugerido (ej: "Desarrollo", "Soporte", "Integración"). Se buscará un tipo similar en la base de datos.'),
    }),
    execute: async ({ titulo, descripcion, clienteId, prioridad, contextoChat, tipoTareaSugerido }): Promise<{ success: boolean; taskId?: string; error?: string }> => {
      try {
        const supabase = await createClient()
        
        // Find a matching tipo_tarea if suggested
        let tipoTareaId: string | null = null
        if (tipoTareaSugerido) {
          const { data: tipos } = await supabase
            .from('tipo_de_tareas')
            .select('id, nombre')
            .eq('activo', true)
            .ilike('nombre', `%${tipoTareaSugerido}%`)
            .limit(1)
          
          if (tipos && tipos.length > 0) {
            tipoTareaId = tipos[0].id
          }
        }
        
        // Create the task
        const { data: tarea, error: tareaError } = await supabase
          .from('tareas')
          .insert({
            titulo,
            descripcion,
            cliente_id: clienteId,
            tipo_tarea_id: tipoTareaId,
            prioridad,
            estado: 'pendiente',
            contexto_chat: contextoChat,
          })
          .select('id')
          .single()
        
        if (tareaError || !tarea) {
          return { success: false, error: `Error al crear tarea: ${tareaError?.message}` }
        }
        
        // Add the first comment with chat context (from Madky)
        const { error: commentError } = await supabase
          .from('comentarios_tareas')
          .insert({
            tarea_id: tarea.id,
            contenido: `**Contexto de la conversación:**\n\n${contextoChat}`,
            autor_nombre: 'Madky',
            es_sistema: true,
          })
        
        if (commentError) {
          console.error('Error adding comment:', commentError)
          // Don't fail the task creation if comment fails
        }
        
        return { success: true, taskId: tarea.id }
      } catch (error) {
        return { success: false, error: `Error inesperado: ${error}` }
      }
    },
  }),
}

export type MadkyTools = typeof madkyTools
