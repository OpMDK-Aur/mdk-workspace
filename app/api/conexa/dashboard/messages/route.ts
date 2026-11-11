import { NextResponse } from 'next/server'
import { canAccessClient, requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { isUuid } from '@/lib/tasks/subtasks-api'

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function GET(request: Request) {
  const { supabase, error } = await requireDashboardUser(request)
  if (error) return error
  const params = new URL(request.url).searchParams
  const clientId = params.get('clientId')
  if (!isUuid(clientId)) return fail('Cliente inválido.')
  if (!await canAccessClient(supabase, clientId)) return fail('No tenés acceso a este cliente.', 404)
  const { data, error: queryError } = await supabase.from('dashboard_chat_messages').select('id, client_id, dashboard_id, user_id, role, content, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100)
  if (queryError) return fail('No se pudo cargar el historial del chat.', 503)
  return NextResponse.json({ messages: (data ?? []).reverse() })
}
