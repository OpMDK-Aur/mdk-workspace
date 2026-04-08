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
        const baseUrl = getBaseUrl()
        const url = `${baseUrl}/api/ads/meta?account_id=${accountId}&date_range=${dateRange}`
        
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        })
        
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          return { error: error.error || `Error ${res.status}` } as MetaAdsResponse
        }
        
        return await res.json()
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

export type MadkyTools = typeof madkyTools
