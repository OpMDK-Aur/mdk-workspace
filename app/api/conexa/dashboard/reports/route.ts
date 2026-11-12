import { NextResponse } from 'next/server'
import { canAccessClient, canAccessDashboard, requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { isUuid } from '@/lib/tasks/subtasks-api'
import { validateDashboardConfig } from '@/lib/conexa/dashboard-presets'

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function GET(request: Request) {
  const { supabase, error } = await requireDashboardUser(request)
  if (error) return error
  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!isUuid(clientId)) return fail('Cliente inválido.')
  if (!await canAccessClient(supabase, clientId)) return fail('No tenés acceso a este cliente.', 404)
  const { data, error: queryError } = await supabase.from('dashboard_reports').select('id, client_id, dashboard_id, created_by, name, config, data_snapshot, period_start, period_end, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100)
  if (queryError) return fail('No se pudo cargar el histórico de informes.', 503)
  return NextResponse.json({ reports: data ?? [] })
}

export async function POST(request: Request) {
  const { supabase, user, error } = await requireDashboardUser(request)
  if (error) return error
  const body = await request.json().catch(() => null)
  if (!body || !isUuid(body.clientId)) return fail('Cliente inválido.')
  if (!await canAccessClient(supabase, body.clientId)) return fail('No tenés acceso a este cliente.', 404)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 180) return fail('El nombre debe tener entre 1 y 180 caracteres.')
  if (body.dashboardId !== null && body.dashboardId !== undefined && !isUuid(body.dashboardId)) return fail('Tablero inválido.')
  if (body.dashboardId && !await canAccessDashboard(supabase, body.clientId, body.dashboardId)) return fail('No tenés acceso a este tablero.', 404)
  const parsed = validateDashboardConfig(body.config)
  if (!parsed.success) return fail('La configuración del informe no es válida.')
  if (!body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)) return fail('Faltan los datos del snapshot.')
  const serializedSnapshot = JSON.stringify(body.snapshot)
  if (serializedSnapshot.length > 5_000_000) return fail('El snapshot supera el tamaño máximo permitido de 5 MB.', 413)
  const periodStart = typeof body.periodStart === 'string' ? body.periodStart : null
  const periodEnd = typeof body.periodEnd === 'string' ? body.periodEnd : null
  const { data, error: insertError } = await supabase.from('dashboard_reports').insert({ client_id: body.clientId, dashboard_id: body.dashboardId ?? null, created_by: user.id, name, config: parsed.data, data_snapshot: body.snapshot, period_start: periodStart, period_end: periodEnd }).select('id, client_id, dashboard_id, created_by, name, config, data_snapshot, period_start, period_end, created_at').single()
  if (insertError) return fail('No se pudo guardar el snapshot del informe.', 503)
  return NextResponse.json({ report: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { supabase, error } = await requireDashboardUser(request)
  if (error) return error
  const body = await request.json().catch(() => null)
  if (!body || !isUuid(body.id) || !isUuid(body.clientId)) return fail('Informe o cliente inválido.')
  if (!await canAccessClient(supabase, body.clientId)) return fail('No tenés acceso a este cliente.', 404)
  const { data, error: deleteError } = await supabase.from('dashboard_reports').delete().eq('id', body.id).eq('client_id', body.clientId).select('id').maybeSingle()
  if (deleteError) return fail('No se pudo eliminar el informe.', 503)
  if (!data) return fail('No se encontró el informe.', 404)
  return NextResponse.json({ ok: true })
}
