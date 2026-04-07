import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Go High Level (GHL) contacts API
// Endpoint: GET /api/crm/contacts?client_id=...&start_date=...&end_date=...
// ---------------------------------------------------------------------------

function pad(n: number): string { return String(n).padStart(2, '0') }

function buildIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getDateRange(preset: string, startDate?: string, endDate?: string): { start: string; end: string } {
  if (startDate && endDate) return { start: startDate, end: endDate }

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const offset = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    d.setHours(0, 0, 0, 0)
    return d
  }

  switch (preset) {
    case 'last_7d':  return { start: buildIso(offset(7)),  end: buildIso(today) }
    case 'last_14d': return { start: buildIso(offset(14)), end: buildIso(today) }
    case 'daily':    return { start: buildIso(new Date()), end: buildIso(today) }
    case 'monthly': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { start: buildIso(s), end: buildIso(e) }
    }
    case 'yearly': {
      const s = new Date(today.getFullYear(), 0, 1)
      const e = new Date(today.getFullYear(), 11, 31)
      return { start: buildIso(s), end: buildIso(e) }
    }
    default: return { start: buildIso(offset(30)), end: buildIso(today) }
  }
}

// GHL API: fetch all contacts created within a date range for a given location
async function fetchGHLContacts(
  locationId: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<{ total: number; byDay: Record<string, number>; error?: string }> {
  const startTs = new Date(startDate + 'T00:00:00.000Z').getTime()
  const endTs   = new Date(endDate   + 'T23:59:59.999Z').getTime()

  const byDay: Record<string, number> = {}
  let total = 0
  let startAfter: string | null = null
  let page = 0

  try {
    do {
      const params = new URLSearchParams({
        locationId,
        limit: '100',
        startAfter: startAfter ?? String(startTs),
        startAfterId: '',
      })

      const url = `https://services.leadconnectorhq.com/contacts/?${params}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: '2021-07-28',
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '(unreadable)')
        return { total: 0, byDay: {}, error: `GHL API ${res.status}: ${text.slice(0, 200)}` }
      }

      const json = await res.json()
      const contacts: Array<{ dateAdded?: string; createdAt?: string }> = json.contacts ?? []

      if (contacts.length === 0) break

      for (const c of contacts) {
        const rawDate = c.dateAdded ?? c.createdAt
        if (!rawDate) continue
        const ts = new Date(rawDate).getTime()
        if (ts < startTs || ts > endTs) continue
        const day = rawDate.slice(0, 10) // yyyy-MM-dd
        byDay[day] = (byDay[day] ?? 0) + 1
        total++
      }

      // GHL pagination: use the last contact's dateAdded as cursor
      const last = contacts[contacts.length - 1]
      const lastTs = last?.dateAdded ?? last?.createdAt
      startAfter = lastTs ? String(new Date(lastTs).getTime()) : null
      page++

      // Safety: stop after 20 pages (2000 contacts)
      if (page >= 20 || contacts.length < 100) break
    } while (startAfter)

    return { total, byDay }
  } catch (err) {
    return { total: 0, byDay: {}, error: String(err) }
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const clientId  = searchParams.get('client_id')
  const preset    = searchParams.get('date_range') ?? 'last_30d'
  const startDate = searchParams.get('start_date') ?? undefined
  const endDate   = searchParams.get('end_date')   ?? undefined

  if (!clientId) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 })

  // Load client CRM credentials
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, business_name, crm_type, ghl_location_id, ghl_token')
    .eq('id', clientId)
    .single()

  if (clientErr || !client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  console.log('[v0] CRM contacts request — client:', client.business_name, 'crm_type:', client.crm_type, 'has_location:', !!client.ghl_location_id, 'has_token:', !!client.ghl_token)

  // Return 0 gracefully when no CRM is configured (not an error)
  if (!client.crm_type) return NextResponse.json({ total: 0, byDay: {}, crm_type: null })
  if (client.crm_type !== 'ghl') return NextResponse.json({ total: 0, byDay: {}, crm_type: client.crm_type })
  if (!client.ghl_location_id || !client.ghl_token) {
    return NextResponse.json({ total: 0, byDay: {}, error: 'Credenciales GHL no configuradas' })
  }

  const { start, end } = getDateRange(preset, startDate, endDate)
  const result = await fetchGHLContacts(client.ghl_location_id, client.ghl_token, start, end)

  return NextResponse.json({
    clientId,
    crm_type: 'ghl',
    total: result.total,
    byDay: result.byDay,
    dateRange: { start, end },
    error: result.error ?? null,
  })
}
