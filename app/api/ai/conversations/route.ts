import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateConversation, listActiveConversations, listConversationMessages } from '@/lib/ai/conversations'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const conversations = await listActiveConversations(supabase, user.id)
    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('[v0] Conversations list failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudieron cargar las conversaciones.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (typeof body.clientId !== 'string' || !body.clientId) {
    return NextResponse.json({ error: 'clientId es requerido.' }, { status: 400 })
  }

  try {
    const conversation = await getOrCreateConversation(supabase, user.id, body.clientId)
    const messages = await listConversationMessages(supabase, user.id, conversation.id)
    return NextResponse.json({ conversation, messages })
  } catch (error) {
    console.error('[v0] Conversation load failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo cargar la conversación.' }, { status: 500 })
  }
}
