import { NextRequest, NextResponse } from 'next/server'
import { createCrmClient } from '@/lib/supabase/crm'

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1') || 1)
  const search = request.nextUrl.searchParams.get('search')?.trim()

  try {
    const crm = createCrmClient()
    let query = crm.from('clients').select('*', { count: 'exact' }).order('id').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (search) query = query.or(`name.ilike.%${search}%,business_name.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) {
      console.error('[CRM clients] Error consultando clients:', error)
      return NextResponse.json({ error: error.message }, { status: 502 })
    }

    return NextResponse.json({ clients: data ?? [], page, pageSize: PAGE_SIZE, total: count ?? 0, hasMore: (count ?? 0) > page * PAGE_SIZE })
  } catch (error) {
    console.error('[CRM clients] Error de conexión:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar los clientes del CRM' }, { status: 500 })
  }
}
