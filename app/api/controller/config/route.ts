import { createClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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
      .from('controller_configuracion')
      .select('*')
      .eq('cliente_id', clienteId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json(data || null)
  } catch (error) {
    console.error('[controller/config] Error:', error)
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      clienteId,
      metaActive,
      metaAccountId,
      metaToken,
      googleActive,
      googleCustomerId,
      googleRefreshToken,
    } = body

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    const { data, error } = await supabase
      .from('controller_configuracion')
      .insert([
        {
          cliente_id: clienteId,
          meta_ad_account_id: metaAccountId,
          meta_access_token: metaToken,
          google_customer_id: googleCustomerId,
          google_refresh_token: googleRefreshToken,
          activo: metaActive || googleActive,
          creado_at: new Date().toISOString(),
          actualizado_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[controller/config] Error:', error)
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      clienteId,
      metaActive,
      metaAccountId,
      metaToken,
      googleActive,
      googleCustomerId,
      googleRefreshToken,
    } = body

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    const { data, error } = await supabase
      .from('controller_configuracion')
      .update({
        meta_ad_account_id: metaAccountId,
        meta_access_token: metaToken,
        google_customer_id: googleCustomerId,
        google_refresh_token: googleRefreshToken,
        activo: metaActive || googleActive,
        actualizado_at: new Date().toISOString(),
      })
      .eq('cliente_id', clienteId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('[controller/config] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar configuración' }, { status: 500 })
  }
}
