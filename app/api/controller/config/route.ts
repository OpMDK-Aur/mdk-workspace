import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get('clienteId')

  if (!clienteId) {
    return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Ejecutar ambas queries en paralelo
    const [configResult, cuentasResult] = await Promise.all([
      supabase
        .from('controller_configuracion')
        .select('*')
        .eq('cliente_id', clienteId)
        .maybeSingle(),
      supabase
        .from('cuentas_publicitarias')
        .select('id, plataforma, id_cuenta, nombre_cuenta, activo')
        .eq('cliente_id', clienteId)
        .eq('activo', true)
        .order('plataforma', { ascending: true })
    ])

    const configuracion = configResult.data
    const cuentas = cuentasResult.data || []

    return NextResponse.json({ configuracion, cuentas })
  } catch (error) {
    console.error('[controller/config] Error:', error)
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clienteId, meta_access_token, google_refresh_token, activo } = body

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
    }

    const supabase = await createClient()

    // UPSERT usando cliente_id como clave de conflicto
    const { data, error } = await supabase
      .from('controller_configuracion')
      .upsert(
        {
          cliente_id: clienteId,
          meta_access_token: meta_access_token || null,
          google_refresh_token: google_refresh_token || null,
          activo: activo ?? true,
          actualizado_at: new Date().toISOString(),
        },
        { onConflict: 'cliente_id' }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error('[controller/config] Error:', error)
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}
