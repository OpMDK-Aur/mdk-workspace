import { createClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ControllerAlerta } from '@/lib/types'

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get('clienteId')

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
      .from('controller_alertas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('categoria', { ascending: true })
      .order('tipo', { ascending: true })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('[controller/alertas] Error:', error)
    return NextResponse.json({ error: 'Error al obtener alertas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clienteId, alertas }: { clienteId: string; alertas: Omit<ControllerAlerta, 'id' | 'creado_at'>[] } = body

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    // Delete existing alertas for this client
    await supabase.from('controller_alertas').delete().eq('cliente_id', clienteId)

    // Insert new alertas
    if (alertas.length > 0) {
      const { data, error } = await supabase
        .from('controller_alertas')
        .insert(
          alertas.map((alerta) => ({
            ...alerta,
            cliente_id: clienteId,
            creado_at: new Date().toISOString(),
          }))
        )
        .select()

      if (error) throw error

      return NextResponse.json(data, { status: 201 })
    }

    return NextResponse.json([], { status: 201 })
  } catch (error) {
    console.error('[controller/alertas] Error:', error)
    return NextResponse.json({ error: 'Error al guardar alertas' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    const { error } = await supabase.from('controller_alertas').delete().eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[controller/alertas] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar alerta' }, { status: 500 })
  }
}
