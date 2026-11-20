import { NextResponse } from 'next/server'
import { requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { todayRange, type InicioAlert, type InicioData, type InicioTask } from '@/lib/conexa/inicio'

export const runtime = 'nodejs'

const DONE_STATES = '(completada,resuelto,no_realizado)'
const MAX_TASKS = 40
const MAX_ALERTS = 60

/**
 * Resumen del día de quien tiene la sesión: sus tareas y reuniones de hoy,
 * las alertas disparadas de sus clientes y las horas registradas hoy.
 * Todas las consultas filtran por la persona de la sesión.
 */
export async function GET(request: Request) {
  const { user, error } = await requireDashboardUser(request)
  if (error) return error
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: colaborador } = user.email
    ? await admin.from('colaboradores').select('id, nombre').eq('email', user.email).maybeSingle()
    : { data: null }
  const me = (colaborador?.id as string | undefined) ?? user.id
  const { start, end } = todayRange()
  const assigned = `asignado_a.eq.${me},asignados_a.cs.{${me}}`

  const [dueToday, meetingsToday, overdue, myClients, entries] = await Promise.all([
    admin.from('tareas').select('id, titulo, estado, fecha_vencimiento, reunion_inicio, reunion_fin, google_meet_url, google_calendar_event_id, cliente:cliente_id(nombre_del_negocio)')
      .or(assigned).not('estado', 'in', DONE_STATES).gte('fecha_vencimiento', start).lt('fecha_vencimiento', end).limit(MAX_TASKS),
    admin.from('tareas').select('id, titulo, estado, fecha_vencimiento, reunion_inicio, reunion_fin, google_meet_url, google_calendar_event_id, cliente:cliente_id(nombre_del_negocio)')
      .or(assigned).gte('reunion_inicio', start).lt('reunion_inicio', end).order('reunion_inicio').limit(MAX_TASKS),
    admin.from('tareas').select('id', { count: 'exact', head: true }).or(assigned).not('estado', 'in', DONE_STATES).lt('fecha_vencimiento', start),
    admin.from('clientes').select('id, nombre_del_negocio').or(`project_manager_id.eq.${me},account_manager_id.eq.${me}`).limit(300),
    admin.from('entradas_de_tiempo').select('iniciado_en, finalizado_en, duracion_seg').eq('colaborador_id', me).gte('iniciado_en', start).lt('iniciado_en', end).limit(200),
  ])

  const byId = new Map<string, InicioTask>()
  for (const row of [...(meetingsToday.data ?? []), ...(dueToday.data ?? [])] as Array<Record<string, unknown>>) {
    const id = String(row.id)
    if (byId.has(id)) continue
    const cliente = row.cliente as { nombre_del_negocio?: string } | null
    byId.set(id, {
      id,
      titulo: String(row.titulo ?? 'Sin título'),
      estado: String(row.estado ?? ''),
      clienteNombre: cliente?.nombre_del_negocio ?? null,
      vence: (row.fecha_vencimiento as string | null) ?? null,
      reunionInicio: (row.reunion_inicio as string | null) ?? null,
      reunionFin: (row.reunion_fin as string | null) ?? null,
      meetUrl: (row.google_meet_url as string | null) ?? null,
      esReunion: Boolean(row.reunion_inicio || row.google_calendar_event_id),
    })
  }
  const tareas = [...byId.values()].sort((a, b) => (a.reunionInicio ?? a.vence ?? '').localeCompare(b.reunionInicio ?? b.vence ?? ''))

  const clientNames = new Map((myClients.data ?? []).map((row) => [String(row.id), String(row.nombre_del_negocio ?? 'Cliente')]))
  let alertas: InicioAlert[] = []
  if (clientNames.size) {
    const { data: fired } = await admin.from('controller_alertas').select('id, cliente_id, subtipo, plataforma, disparada_desde')
      .in('cliente_id', [...clientNames.keys()]).eq('activa', true).eq('estado_actual', 'disparada').order('disparada_desde', { ascending: false }).limit(MAX_ALERTS)
    const alertIds = (fired ?? []).map((row) => String(row.id))
    const { data: runs } = alertIds.length
      ? await admin.from('controller_ejecuciones').select('alerta_id, mensaje, ejecutado_at').in('alerta_id', alertIds).eq('disparada', true).order('ejecutado_at', { ascending: false }).limit(MAX_ALERTS * 3)
      : { data: [] as Array<{ alerta_id: string; mensaje: string | null }> }
    const lastMessage = new Map<string, string | null>()
    for (const run of runs ?? []) if (!lastMessage.has(String(run.alerta_id))) lastMessage.set(String(run.alerta_id), (run.mensaje as string | null) ?? null)
    alertas = (fired ?? []).map((row) => ({
      id: String(row.id),
      clienteId: String(row.cliente_id),
      clienteNombre: clientNames.get(String(row.cliente_id)) ?? 'Cliente',
      subtipo: String(row.subtipo ?? ''),
      plataforma: (row.plataforma as string | null) ?? null,
      desde: (row.disparada_desde as string | null) ?? null,
      mensaje: lastMessage.get(String(row.id))?.replace(/^(Nueva detección|Re-notificación \(7\+ días activa\)):\s*/, '').split('. •')[0] ?? null,
    }))
  }

  const now = Date.now()
  let segundosHoy = 0
  let timerCorriendo = false
  for (const entry of entries.data ?? []) {
    if (entry.finalizado_en) segundosHoy += Number(entry.duracion_seg) || 0
    else { timerCorriendo = true; segundosHoy += Math.max(0, (now - new Date(String(entry.iniciado_en)).getTime()) / 1000) }
  }

  const body: InicioData = { nombre: String(colaborador?.nombre ?? user.user_metadata?.nombre ?? ''), tareas, vencidas: overdue.count ?? 0, alertas, segundosHoy: Math.round(segundosHoy), timerCorriendo }
  return NextResponse.json(body)
}
