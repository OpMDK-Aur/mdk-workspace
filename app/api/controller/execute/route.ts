import { createClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clienteId, alertaSubtipo }: { clienteId: string; alertaSubtipo: string } = body

    if (!clienteId || !alertaSubtipo) {
      return NextResponse.json({ error: 'clienteId y alertaSubtipo requeridos' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    // Obtener la alerta - buscar por subtipo
    const { data: alerta, error: alertError } = await supabase
      .from('controller_alertas')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('subtipo', alertaSubtipo)
      .maybeSingle()

    if (alertError) {
      console.error('Error fetching alert:', alertError)
      return NextResponse.json({ error: 'Error obteniendo alerta' }, { status: 500 })
    }

    if (!alerta) {
      console.error('Alerta no encontrada para:', { clienteId, alertaSubtipo })
      return NextResponse.json({ error: 'Alerta no encontrada' }, { status: 404 })
    }

    if (!alerta.activa) {
      return NextResponse.json({ error: 'Esta alerta está desactivada' }, { status: 400 })
    }

    // Ejecutar la lógica de la alerta
    let resultado = {
      alerta_id: alerta.id,
      subtipo: alertaSubtipo,
      estado: 'ejecutada',
      timestamp: new Date().toISOString(),
      acciones: [] as string[],
    }

    // Simular acciones según el tipo de alerta
    const accion = alerta.accion || 'ambas'
    if (accion === 'tarea' || accion === 'ambas') {
      resultado.acciones.push('Crear tarea asignada al Account Manager')
    }
    if (accion === 'notificacion' || accion === 'ambas') {
      resultado.acciones.push('Enviar notificación interna')
    }

    // Guardar en historial (opcional, solo si la tabla existe)
    try {
      await supabase.from('controller_historial').insert({
        cliente_id: clienteId,
        alerta_id: alerta.id,
        tipo: 'ejecucion_manual',
        detalles: {
          subtipo: alertaSubtipo,
          acciones: resultado.acciones,
        },
        creado_at: new Date().toISOString(),
      })
    } catch (historialError) {
      console.error('Error guardando en historial (continuando):', historialError)
      // Continuar sin guardar en historial si la tabla no existe
    }

    return NextResponse.json(resultado, { status: 200 })
  } catch (error) {
    console.error('[controller/execute] Error:', error)
    return NextResponse.json({ error: 'Error ejecutando alerta', details: String(error) }, { status: 500 })
  }
}
