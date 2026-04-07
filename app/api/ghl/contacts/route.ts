import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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
  meta?: { total?: number; nextPageUrl?: string | null }
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

    // Simple request to GHL - only locationId as query param
    const url = `https://services.leadconnectorhq.com/contacts/?locationId=${client.ghl_location_id}`

    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${client.ghl_token}`,
          Version: '2021-07-28',
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

    const allContacts: GHLContact[] = (json.contacts ?? []).map((c: GHLContact) => ({
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

    const totalFetched = allContacts.length

    // Filter by dateAdded server-side
    let contacts: GHLContact[] = allContacts
    if (startDate || endDate) {
      const startMs = startDate ? new Date(startDate + 'T00:00:00Z').getTime() : null
      const endMs = endDate ? new Date(endDate + 'T23:59:59Z').getTime() : null
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
    }

    return NextResponse.json({
      contacts,
      total: contacts.length,
      totalUnfiltered: totalFetched,
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
