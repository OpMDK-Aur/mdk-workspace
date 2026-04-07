import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MAX_PAGES = 50 // Safety limit to prevent infinite loops
const PAGE_SIZE = 100 // Use smaller page size to avoid issues
const DELAY_BETWEEN_REQUESTS = 300 // ms delay between pagination requests
const MAX_RETRIES = 3

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper to fetch with retry and backoff for rate limiting
async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, options)
    
    if (res.status === 429) {
      // Rate limited - wait and retry with exponential backoff
      const waitTime = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
      console.log(`[v0] GHL rate limited, waiting ${waitTime}ms before retry ${attempt}/${retries}`)
      await delay(waitTime)
      continue
    }
    
    return res
  }
  
  // Final attempt after all retries
  return fetch(url, options)
}

export interface GHLOpportunity {
  id: string
  name: string
  monetaryValue: number | null
  pipelineId: string
  pipelineStageId: string
  status: string
  source: string | null
  contact: {
    id: string
    name: string
    email: string | null
    phone: string | null
    tags: string[]
  } | null
  createdAt: string
  updatedAt: string
}

interface GHLOpportunitiesResponse {
  opportunities: GHLOpportunity[]
  meta?: {
    total?: number
    nextPageUrl?: string | null
    startAfterId?: string | null
    startAfter?: number | null
    currentPage?: number
    nextPage?: number | null
    previousPage?: number | null
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const clientId = searchParams.get('client_id')
    const startDate = searchParams.get('startDate') ?? undefined
    const endDate = searchParams.get('endDate') ?? undefined

    if (!clientId) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

    // Load client CRM credentials from Supabase
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, business_name, crm_type, ghl_location_id, ghl_token')
      .eq('id', clientId)
      .single()

    if (clientErr || !client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    if (client.crm_type !== 'ghl') return NextResponse.json({ error: `CRM type "${client.crm_type}" no soportado`, crm_type: client.crm_type }, { status: 400 })
    if (!client.ghl_location_id || !client.ghl_token) {
      return NextResponse.json({ error: 'Credenciales GHL no configuradas. Configuralas en Plataformas.' }, { status: 400 })
    }

    const url = 'https://services.leadconnectorhq.com/opportunities/search'
    const allOpportunities: GHLOpportunity[] = []
    let currentPage = 0
    let searchAfter: string[] | undefined = undefined
    let hasMorePages = true

    console.log(`[v0] GHL Opportunities: Starting pagination for client ${client.business_name}`)

    // Paginate through all opportunities using searchAfter
    while (hasMorePages && currentPage < MAX_PAGES) {
      // Build request body - GHL uses searchAfter for pagination, not page number
      const body: Record<string, unknown> = {
        locationId: client.ghl_location_id,
        limit: PAGE_SIZE,
      }

      // Add searchAfter for pagination (after first request)
      if (searchAfter && searchAfter.length > 0) {
        body.searchAfter = searchAfter
      }

      console.log(`[v0] GHL Opportunities: Fetching page ${currentPage + 1}, searchAfter=${searchAfter ? JSON.stringify(searchAfter) : 'none'}`)

      // Add delay between requests to avoid rate limiting (except first request)
      if (currentPage > 0) {
        await delay(DELAY_BETWEEN_REQUESTS)
      }

      let res: Response
      try {
        res = await fetchWithRetry(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${client.ghl_token}`,
            Version: '2021-07-28',
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        })
      } catch (err) {
        console.error(`[v0] GHL Opportunities: Network error on page ${currentPage + 1}:`, err)
        return NextResponse.json({ error: `Error de red al conectar con GHL: ${err}` }, { status: 502 })
      }

      if (!res.ok) {
        let msg = `GHL HTTP ${res.status}`
        try { 
          const errBody = await res.json()
          msg = errBody?.message ?? errBody?.error ?? JSON.stringify(errBody) 
        } catch { /* ignore */ }
        console.error(`[v0] GHL Opportunities: HTTP error on page ${currentPage + 1}: ${msg}`)
        
        // If we already have some data, return what we have instead of failing completely
        if (allOpportunities.length > 0) {
          console.log(`[v0] GHL Opportunities: Returning partial data (${allOpportunities.length} opportunities)`)
          break
        }
        return NextResponse.json({ error: msg }, { status: res.status })
      }

      const json: GHLOpportunitiesResponse = await res.json()
      const pageOpportunities = json.opportunities ?? []

      console.log(`[v0] GHL Opportunities: Page ${currentPage + 1} returned ${pageOpportunities.length} opportunities`)

      // Map and accumulate opportunities
      for (const o of pageOpportunities) {
        allOpportunities.push({
          id: o.id ?? '',
          name: o.name ?? '',
          monetaryValue: o.monetaryValue ?? null,
          pipelineId: o.pipelineId ?? '',
          pipelineStageId: o.pipelineStageId ?? '',
          status: o.status ?? '',
          source: o.source ?? null,
          contact: o.contact ? {
            id: o.contact.id ?? '',
            name: o.contact.name ?? '',
            email: o.contact.email ?? null,
            phone: o.contact.phone ?? null,
            tags: Array.isArray(o.contact.tags) ? o.contact.tags : [],
          } : null,
          createdAt: o.createdAt ?? '',
          updatedAt: o.updatedAt ?? '',
        })
      }

      currentPage++

      // Check if there are more pages
      // Stop if: no results, less than PAGE_SIZE results
      if (pageOpportunities.length === 0 || pageOpportunities.length < PAGE_SIZE) {
        hasMorePages = false
      } else {
        // Get the last opportunity's ID for searchAfter pagination
        const lastOpp = pageOpportunities[pageOpportunities.length - 1]
        if (lastOpp?.id) {
          searchAfter = [lastOpp.id]
        } else {
          hasMorePages = false
        }
      }
    }

    console.log(`[v0] GHL Opportunities: Pagination complete. Total pages: ${currentPage}, Total accumulated: ${allOpportunities.length}`)

    // Filter by createdAt locally AFTER getting all pages
    let opportunities = allOpportunities
    if (startDate || endDate) {
      const startMs = startDate ? new Date(startDate + 'T00:00:00Z').getTime() : null
      const endMs = endDate ? new Date(endDate + 'T23:59:59Z').getTime() : null

      console.log(`[v0] GHL Opportunities: Applying date filter. startDate=${startDate} (${startMs}), endDate=${endDate} (${endMs})`)

      opportunities = allOpportunities.filter(o => {
        if (!o.createdAt) return false
        const createdMs = new Date(o.createdAt).getTime()
        if (isNaN(createdMs)) return false
        if (startMs !== null && createdMs < startMs) return false
        if (endMs !== null && createdMs > endMs) return false
        return true
      })

      console.log(`[v0] GHL Opportunities: After date filter: ${opportunities.length} of ${allOpportunities.length}`)
    }

    // Log sample dates for debugging
    if (allOpportunities.length > 0) {
      const sampleDates = allOpportunities.slice(0, 3).map(o => ({
        name: o.name,
        createdAt: o.createdAt,
      }))
      console.log(`[v0] GHL Opportunities: Sample dates:`, JSON.stringify(sampleDates))
    }

    return NextResponse.json({
      opportunities,
      total: opportunities.length,
      totalUnfiltered: allOpportunities.length,
      pages: currentPage,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[v0] GHL opportunities API error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    }, { status: 500 })
  }
}
