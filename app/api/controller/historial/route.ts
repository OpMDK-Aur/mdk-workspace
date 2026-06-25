import { createClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get('clienteId')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '30', 10)

  if (!clienteId) {
    return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
  }

  try {
    const cookieStore = await cookies()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    const { data, error } = await supabase
      .from('controller_ejecuciones')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('ejecutado_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('[controller/historial] Error:', error)
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 })
  }
}
