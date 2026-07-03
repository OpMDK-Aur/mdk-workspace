// app/api/agentes/revops/execute/route.ts
import { createClient } from '@/lib/supabase/server'
import { runRevOpsAnalysis } from '@/lib/revops/analyze'
import { NextResponse } from 'next/server'

export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clienteId, periodoDesde, periodoHasta } = await req.json()
  if (!clienteId) return NextResponse.json({ error: 'clienteId requerido' }, { status: 400 })

  const hoy = new Date()
  const desdeDefault = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Si el front no manda un rango explícito (para igualar el filtro de GHL),
  // se usa el default de los últimos 30 días, igual que antes.
  const desde = periodoDesde || desdeDefault.toISOString().split('T')[0]
  const hasta = periodoHasta || hoy.toISOString().split('T')[0]

  const result = await runRevOpsAnalysis(supabase, clienteId, { desde, hasta })

  const { data: ejecucion, error: insertError } = await supabase
    .from('revops_ejecuciones')
    .insert({
      cliente_id: clienteId,
      crm_type: 'ghl',
      ejecutado_por: user.id,
      estado: result.estado,
      error_detalle: result.error_detalle ?? null,
      score_salud: result.score_salud,
      periodo_desde: desde,
      periodo_hasta: hasta,
      resumen: result.resumen ?? {},
    })
    .select('*')
    .single()

  if (insertError) {
    console.error('[v0] Error guardando ejecución de RevOps:', insertError)
    return NextResponse.json({ error: 'No se pudo guardar el resultado', detalle: result }, { status: 500 })
  }

  await supabase.from('agentes_log').insert({
    agente: 'revops',
    ejecutado_por: user.id,
    cliente_id: clienteId,
    clientes_auditados: 1,
    estado: result.estado === 'ok' ? 'ok' : result.estado === 'parcial' ? 'parcial' : 'error',
    resultado: { score_salud: result.score_salud, alertas: result.resumen?.alertas ?? [] },
  })

  return NextResponse.json(ejecucion)
}