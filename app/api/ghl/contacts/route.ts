import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const MAX_PAGES = 100 // Safety limit to prevent infinite loops
const PAGE_SIZE = 100 // GHL contacts endpoint limit per request
const DELAY_BETWEEN_REQUESTS = 200 // ms delay between pagination requests
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

export interface GHLContactAttribution {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  campaignId?: string | null
  adId?: string | null
  url?: string | null
  referrer?: string | null
}

export interface GHLContact {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  source: string | null
  tags: string[]
  dateAdded: string | null
  locationId: string
  attributionSource: GHLContactAttribution | null
  lastAttributionSource: GHLContactAttribution | null
}

interface GHLContactsResponse {
  contacts: GHLContact[]
  meta?: {
    total?: number
    nextPageUrl?: string | null
    startAfterId?: string | null
    startAfter?: number | null
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
      .from('clientes')
      .select('id, business_name, crm_type, ghl_location_id, ghl_token')
      .eq('id', clientId)
      .single()

    if (clientErr || !client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    if (client.crm_type !== 'ghl') return NextResponse.json({ error: `CRM type "${client.crm_type}" no soportado`, crm_type: client.crm_type }, { status: 400 })
    if (!client.ghl_location_id || !client.ghl_token) {
      return NextResponse.json({ error: 'Credenciales GHL no configuradas. Configuralas en Plataformas.' }, { status: 400 })
    }

    const baseUrl = 'https://services.leadconnectorhq.com/contacts/'
    const allContacts: GHLContact[] = []
    let currentPage = 0
    let hasMorePages = true
    let nextPageUrl: string | null = null

    console.log(`[v0] GHL Contacts: Starting pagination for client ${client.business_name}`)

    // Paginate through all contacts
    while (hasMorePages && currentPage < MAX_PAGES) {
      // Build URL - first page uses base URL, subsequent pages use nextPageUrl or startAfterId
      let url: string
      if (currentPage === 0) {
        url = `${baseUrl}?locationId=${client.ghl_location_id}&limit=${PAGE_SIZE}`
      } else if (nextPageUrl) {
        url = nextPageUrl
      } else {
        // Fallback: stop if no nextPageUrl
        break
      }

      console.log(`[v0] GHL Contacts: Fetching page ${currentPage + 1}`)

      // Add delay between requests to avoid rate limiting (except first request)
      if (currentPage > 0) {
        await delay(DELAY_BETWEEN_REQUESTS)
      }

      let res: Response
      try {
        res = await fetchWithRetry(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${client.ghl_token}`,
            Version: '2021-07-28',
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        })
      } catch (err) {
        console.error(`[v0] GHL Contacts: Network error on page ${currentPage + 1}:`, err)
        return NextResponse.json({ error: `Error de red al conectar con GHL: ${err}` }, { status: 502 })
      }

      if (!res.ok) {
        let msg = `GHL HTTP ${res.status}`
        try { const body = await res.json(); msg = body?.message ?? body?.error ?? msg } catch { /* ignore */ }
        console.error(`[v0] GHL Contacts: HTTP error on page ${currentPage + 1}: ${msg}`)
        return NextResponse.json({ error: msg }, { status: res.status })
      }

      const json: GHLContactsResponse = await res.json()
      const pageContacts = json.contacts ?? []

      console.log(`[v0] GHL Contacts: Page ${currentPage + 1} returned ${pageContacts.length} contacts`)

      // Map and accumulate contacts
      for (const c of pageContacts) {
        allContacts.push({
          id: c.id ?? '',
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          source: c.source ?? null,
          tags: Array.isArray(c.tags) ? c.tags : [],
          dateAdded: c.dateAdded ?? null,
          locationId: c.locationId ?? client.ghl_location_id,
          attributionSource: c.attributionSource ?? null,
          lastAttributionSource: c.lastAttributionSource ?? null,
        })
      }

      currentPage++

      // Check if there are more pages using nextPageUrl from meta
      nextPageUrl = json.meta?.nextPageUrl ?? null
      
      if (pageContacts.length === 0 || pageContacts.length < PAGE_SIZE || !nextPageUrl) {
        hasMorePages = false
      }
    }

    console.log(`[v0] GHL Contacts: Pagination complete. Total pages: ${currentPage}, Total accumulated: ${allContacts.length}`)

    // Filter by dateAdded AFTER getting all contacts
    let contacts: GHLContact[] = allContacts
    if (startDate || endDate) {
      const startMs = startDate ? new Date(startDate + 'T00:00:00Z').getTime() : null
      const endMs = endDate ? new Date(endDate + 'T23:59:59Z').getTime() : null

      console.log(`[v0] GHL Contacts: Applying date filter. startDate=${startDate} (${startMs}), endDate=${endDate} (${endMs})`)

      contacts = allContacts.filter(c => {
        if (!c.dateAdded) return false
        const raw = c.dateAdded
        let added: number
        if (typeof raw === 'number') {
          added = raw > 1e12 ? raw : raw * 1000
        } else if (/^\d+$/.test(String(raw))) {
          const num = Number(raw)
          added = num > 1e12 ? num : num * 1000
        } else {
          added = new Date(raw).getTime()
        }
        if (isNaN(added)) return false
        if (startMs !== null && added < startMs) return false
        if (endMs !== null && added > endMs) return false
        return true
      })

      console.log(`[v0] GHL Contacts: After date filter: ${contacts.length} of ${allContacts.length}`)
    }

    // Log sample dates for debugging
    if (allContacts.length > 0) {
      const sampleDates = allContacts.slice(0, 3).map(c => ({
        name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
        dateAdded: c.dateAdded,
      }))
      console.log(`[v0] GHL Contacts: Sample dates:`, JSON.stringify(sampleDates))
    }

    return NextResponse.json({
      contacts,
      total: contacts.length,
      totalUnfiltered: allContacts.length,
      pages: currentPage,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[v0] GHL contacts API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error interno del servidor' 
    }, { status: 500 })
  }
}
