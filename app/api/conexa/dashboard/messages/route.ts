import { NextResponse } from 'next/server'
import { canAccessClient, canAccessDashboard, requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { isUuid } from '@/lib/tasks/subtasks-api'

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function GET(request: Request) {
  const { supabase, error } = await requireDashboardUser()
  if (error) return error
  const params = new URL(request.url).searchParams
  const clientId = params.get('clientId')
  const dashboardId = params.get('dashboardId')
  if (!isUuid(clientId)) return fail('Cliente inválido.')
  if (dashboardId && !isUuid(dashboardId)) return fail('Tablero inválido.')
  if (!await canAccessClient(supabase, clientId)) return fail('No tenés acceso a este cliente.', 404)
  if (dashboardId && !await canAccessDashboard(supabase, clientId, dashboardId)) return fail('No tenés acceso a este tablero.', 404)
  let query = supabase.from('dashboard_chat_messages').select('id, client_id, dashboard_id, user_id, role, content, created_at').eq('client_id', clientId)
  query = dashboardId ? query.eq('dashboard_id', dashboardId) : query.is('dashboard_id', null)
  const { data, error: queryError } = await query.order('created_at', { ascending: false }).limit(100)
  if (queryError) return fail('No se pudo cargar el historial del chat.', 503)
  return NextResponse.json({ messages: (data ?? []).reverse() })
}
