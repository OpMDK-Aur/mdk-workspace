import { NextResponse } from 'next/server'
import { canAccessClient, requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { getOrCreateConversation, listConversationMessages } from '@/lib/ai/conversations'
import { isUuid } from '@/lib/tasks/subtasks-api'

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function GET(request: Request) {
  const { supabase, user, error } = await requireDashboardUser(request)
  if (error) return error
  if (!user) return fail('No autorizado.', 401)
  const params = new URL(request.url).searchParams
  const clientId = params.get('clientId')
  if (!isUuid(clientId)) return fail('Cliente inválido.')
  if (!await canAccessClient(supabase, clientId)) return fail('No tenés acceso a este cliente.', 404)
  try {
    const conversation = await getOrCreateConversation(supabase, user.id, clientId)
    const messages = await listConversationMessages(supabase, user.id, conversation.id, { limit: 100 })
    return NextResponse.json({ conversationId: conversation.id, messages })
  } catch {
    return fail('No se pudo cargar el hilo compartido de Chat / Análisis.', 503)
  }
}
