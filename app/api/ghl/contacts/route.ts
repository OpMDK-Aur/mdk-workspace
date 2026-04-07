import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

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
  attributionSource: GHLContactAttribution | null       // first touch
  lastAttributionSource: GHLContactAttribution | null   // last touch
}

interface GHLContactsResponse {
  contacts: GHLContact[]
  meta?: { total?: number; nextPageUrl?: string | null; startAfter?: number | null; startAfterId?: string | null }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const clientId = searchParams.get('client_id')
  const maxContacts = parseInt(searchParams.get('limit') ?? '0') || 0
  const startDate = searchParams.get('startDate') ?? undefined
  const endDate = searchParams.get('endDate') ?? undefined
  const startAfter = searchParams.get('startAfter') ?? undefined

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

  // GHL max per page = 100. Paginate server-side until all contacts are fetched.
  const GHL_PAGE_SIZE = 100
  const allContacts: GHLContact[] = []
  let currentStartAfter: string | undefined = startAfter
  let totalUnfiltered = 0
  let lastNextStartAfter: number | null = null
  let lastNextStartAfterId: string | null = null
  let pageCount = 0
  const MAX_PAGES = 20 // safety cap = 2000 contacts max

  while (pageCount < MAX_PAGES) {
    const params = new URLSearchParams({
      locationId: client.ghl_location_id,
      limit: String(GHL_PAGE_SIZE),
    })
    // Only add startAfter if it's a valid numeric timestamp
    if (currentStartAfter && /^\d+$/.test(currentStartAfter)) {
      params.set('startAfter', currentStartAfter)
    }

    const url = `${GHL_BASE}/contacts/?${params}`

    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${client.ghl_token}`,
          Version: GHL_VERSION,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      })
    } catch (err) {
      return NextResponse.json({ error: `Error de red al conectar con GHL: ${err}` }, { status: 502 })
    }

    if (!res.ok) {
      let msg = `GHL HTTP ${res.status}`
      try { const body = await res.json(); msg = body?.message ?? body?.error ?? msg } catch { /* ignore */ }
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const json: GHLContactsResponse = await res.json()

    const page = (json.contacts ?? []).map((c: GHLContact) => ({
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
    }))

    allContacts.push(...page)
    totalUnfiltered = json.meta?.total ?? allContacts.length
    pageCount++

    // GHL pagination uses startAfter (numeric timestamp) - prefer this over startAfterId
    const nextStartAfterNum = json.meta?.startAfter ?? null
    lastNextStartAfter = nextStartAfterNum
    lastNextStartAfterId = json.meta?.startAfterId ?? null

    if (!nextStartAfterNum || page.length < GHL_PAGE_SIZE) break
    if (maxContacts > 0 && allContacts.length >= maxContacts) break

    currentStartAfter = String(nextStartAfterNum)
  }

  const totalFetched = allContacts.length

  // Filter by dateAdded server-side.
  // GHL returns dateAdded as an ISO string (e.g. "2024-03-10T14:23:00+00:00") or Unix ms timestamp.
  let contacts: GHLContact[] = allContacts
  if (startDate || endDate) {
    const startMs = startDate ? new Date(startDate + 'T00:00:00Z').getTime() : null
    const endMs = endDate ? new Date(endDate + 'T23:59:59Z').getTime() : null
    contacts = allContacts.filter(c => {
      if (!c.dateAdded) return false
      // Handle both ISO string and numeric ms timestamp
      const raw = c.dateAdded
      let added: number
      if (typeof raw === 'number') {
        // If it's already a number, check if it's seconds or milliseconds
        added = raw > 1e12 ? raw : raw * 1000
      } else if (/^\d+$/.test(String(raw))) {
        // String that looks like a number
        const num = Number(raw)
        added = num > 1e12 ? num : num * 1000
      } else {
        // ISO string
        added = new Date(raw).getTime()
      }
      if (isNaN(added)) return false
      if (startMs !== null && added < startMs) return false
      if (endMs !== null && added > endMs) return false
      return true
    })
  }

  // Debug: log sample dateAdded values to understand the date format
  const sampleDates = allContacts.slice(0, 5).map(c => ({ id: c.id, dateAdded: c.dateAdded }))
  console.log(`[v0] GHL contacts: fetched=${allContacts.length} filtered=${contacts.length} pages=${pageCount} startDate=${startDate} endDate=${endDate}`)
  console.log(`[v0] GHL sample dateAdded values:`, JSON.stringify(sampleDates))

  return NextResponse.json({
    contacts,
    total: contacts.length,
    totalUnfiltered: totalFetched,
    nextStartAfter: lastNextStartAfter,
    nextStartAfterId: lastNextStartAfterId,
    pages: pageCount,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
