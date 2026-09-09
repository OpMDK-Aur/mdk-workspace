import { NextRequest, NextResponse } from 'next/server'
import { createCrmClient } from '@/lib/supabase/crm'

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1') || 1)
  const search = request.nextUrl.searchParams.get('search')?.trim()
  const escapedSearch = search?.replace(/[,%()\\]/g, character => `\\${character}`)

  try {
    const crm = createCrmClient()
    const { data, error } = await crm.from('clients').select('*').order('id').range(0, 9999)
    if (error) {
      console.error('[CRM clients] Error consultando clients:', error)
      return NextResponse.json({ error: error.message }, { status: 502 })
    }

    const normalizedSearch = search?.toLocaleLowerCase('es-AR')
    const filteredClients = normalizedSearch
      ? (data ?? []).filter(client => Object.values(client as Record<string, unknown>).some(value => String(value ?? '').toLocaleLowerCase('es-AR').includes(normalizedSearch)))
      : (data ?? [])
    const start = (page - 1) * PAGE_SIZE
    const clients = filteredClients.slice(start, start + PAGE_SIZE)

    return NextResponse.json({ clients, page, pageSize: PAGE_SIZE, total: filteredClients.length, hasMore: filteredClients.length > start + PAGE_SIZE })
  } catch (error) {
    console.error('[CRM clients] Error de conexión:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron cargar los clientes del CRM' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
