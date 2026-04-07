import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

    // Build request body for opportunities search
    const body: Record<string, unknown> = {
      locationId: client.ghl_location_id,
      limit: 500,
    }

    // Add date filter if provided
    if (startDate) {
      body.startDate = new Date(startDate + 'T00:00:00Z').toISOString()
    }
    if (endDate) {
      body.endDate = new Date(endDate + 'T23:59:59Z').toISOString()
    }

    const url = 'https://services.leadconnectorhq.com/opportunities/search'

    let res: Response
    try {
      res = await fetch(url, {
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
      return NextResponse.json({ error: `Error de red al conectar con GHL: ${err}` }, { status: 502 })
    }

    if (!res.ok) {
      let msg = `GHL HTTP ${res.status}`
      try { const errBody = await res.json(); msg = errBody?.message ?? errBody?.error ?? JSON.stringify(errBody) } catch { /* ignore */ }
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const json: GHLOpportunitiesResponse = await res.json()

    const opportunities: GHLOpportunity[] = (json.opportunities ?? []).map((o: GHLOpportunity) => ({
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
    }))

    return NextResponse.json({
      opportunities,
      total: opportunities.length,
      meta: json.meta ?? null,
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
