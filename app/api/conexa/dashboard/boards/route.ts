import { NextResponse } from 'next/server'
import { canAccessClient, requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { isUuid } from '@/lib/tasks/subtasks-api'
import { normalizeDashboardConfig, validateDashboardConfig } from '@/lib/conexa/dashboard-presets'

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function GET(request: Request) {
  const { supabase, error } = await requireDashboardUser(request)
  if (error) return error
  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!isUuid(clientId)) return fail('Cliente inválido.')
  if (!await canAccessClient(supabase, clientId)) return fail('No tenés acceso a este cliente.', 404)
  const { data, error: queryError } = await supabase.from('dashboards').select('id, client_id, name, config, is_default, created_by, updated_by, created_at, updated_at').eq('client_id', clientId).eq('is_default', false).order('updated_at', { ascending: false })
  if (queryError) return fail('No se pudieron cargar los tableros guardados.', 503)
  return NextResponse.json({ dashboards: (data ?? []).map((dashboard) => ({ ...dashboard, config: normalizeDashboardConfig(dashboard.config) })) })
}

export async function POST(request: Request) {
  const { supabase, user, error } = await requireDashboardUser(request)
  if (error) return error
  const body = await request.json().catch(() => null)
  if (!body || !isUuid(body.clientId)) return fail('Cliente inválido.')
  if (!await canAccessClient(supabase, body.clientId)) return fail('No tenés acceso a este cliente.', 404)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const parsed = validateDashboardConfig(body.config)
  if (!name || name.length > 120) return fail('El nombre debe tener entre 1 y 120 caracteres.')
  if (!parsed.success) return fail('La configuración del tablero no es válida.')
  const { data, error: insertError } = await supabase.from('dashboards').insert({ client_id: body.clientId, name, config: parsed.data, is_default: false, created_by: user.id, updated_by: user.id }).select('id, client_id, name, config, is_default, created_by, updated_by, created_at, updated_at').single()
  if (insertError) return fail(insertError.code === '23505' ? 'Ya existe un tablero con ese nombre para este cliente.' : 'No se pudo guardar el tablero.', insertError.code === '23505' ? 409 : 503)
  return NextResponse.json({ dashboard: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { supabase, user, error } = await requireDashboardUser(request)
  if (error) return error
  const body = await request.json().catch(() => null)
  if (!body || !isUuid(body.id) || !isUuid(body.clientId)) return fail('Tablero o cliente inválido.')
  if (!await canAccessClient(supabase, body.clientId)) return fail('No tenés acceso a este cliente.', 404)
  const update: Record<string, unknown> = { updated_by: user.id }
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) return fail('El nombre debe tener entre 1 y 120 caracteres.')
    update.name = name
  }
  if (body.config !== undefined) {
    const parsed = validateDashboardConfig(body.config)
    if (!parsed.success) return fail('La configuración del tablero no es válida.')
    update.config = parsed.data
  }
  const { data, error: updateError } = await supabase.from('dashboards').update(update).eq('id', body.id).eq('client_id', body.clientId).eq('is_default', false).select('id, client_id, name, config, is_default, created_by, updated_by, created_at, updated_at').maybeSingle()
  if (updateError) return fail(updateError.code === '23505' ? 'Ya existe un tablero con ese nombre para este cliente.' : 'No se pudo actualizar el tablero.', updateError.code === '23505' ? 409 : 503)
  if (!data) return fail('El tablero no existe o no se puede sobrescribir.', 404)
  return NextResponse.json({ dashboard: data })
}

export async function DELETE(request: Request) {
  const { supabase, error } = await requireDashboardUser(request)
  if (error) return error
  const body = await request.json().catch(() => null)
  if (!body || !isUuid(body.id) || !isUuid(body.clientId)) return fail('Tablero o cliente inválido.')
  const { data, error: deleteError } = await supabase.from('dashboards').delete().eq('id', body.id).eq('client_id', body.clientId).eq('is_default', false).select('id').maybeSingle()
  if (deleteError) return fail('No se pudo eliminar el tablero.', 503)
  if (!data) return fail('El tablero no existe o no se puede eliminar.', 404)
  return NextResponse.json({ ok: true })
}
