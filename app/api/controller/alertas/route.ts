import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAlertaMeta } from '@/lib/controller-alertas'

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get('clienteId')
  const all = req.nextUrl.searchParams.get('all') === 'true'
  const soloActivas = req.nextUrl.searchParams.get('activas') === 'true'

  if (!clienteId && !all) {
    return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    let query = supabase
      .from('controller_alertas')
      .select('*')
      .order('categoria', { ascending: true })
      .order('tipo', { ascending: true })

    // Si no es modo "all", filtrar por cliente
    if (!all && clienteId) {
      query = query.eq('cliente_id', clienteId)
    }
    if (soloActivas) {
      query = query.eq('activa', true)
    }

    const { data, error } = await query

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
    const { clienteId, alertas }: {
      clienteId: string
      alertas: Array<{
        subtipo: string
        activa: boolean
        plataforma: string
        accion: string
        // Acepta tanto el formato nuevo (parametros) como el legacy (configuracion)
        parametros?: Record<string, unknown>
        configuracion?: Record<string, unknown>
      }>
    } = body

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })
    }

    const supabase = await createClient()

    // Delete existing alertas for this client
    await supabase.from('controller_alertas').delete().eq('cliente_id', clienteId)

    // Mapear cada alerta a las columnas reales de la tabla, completando
    // categoria y tipo a partir del catálogo (son NOT NULL en la BD).
    const rows = alertas.map((alerta) => {
      const meta = getAlertaMeta(alerta.subtipo)
      return {
        cliente_id: clienteId,
        categoria: meta?.categoria ?? 'rendimiento',
        tipo: meta?.tipo ?? alerta.subtipo,
        subtipo: alerta.subtipo,
        plataforma: alerta.plataforma ?? 'ambas',
        parametros: alerta.parametros ?? alerta.configuracion ?? {},
        accion: alerta.accion ?? 'ambas',
        activa: alerta.activa ?? false,
        creado_at: new Date().toISOString(),
      }
    })

    if (rows.length > 0) {
      const { data, error } = await supabase
        .from('controller_alertas')
        .insert(rows)
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

    const supabase = await createClient()

    const { error } = await supabase.from('controller_alertas').delete().eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[controller/alertas] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar alerta' }, { status: 500 })
  }
}
