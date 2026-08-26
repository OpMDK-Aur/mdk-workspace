import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { archiveConversation, getOrCreateConversation, listConversations, listConversationMessages, unarchiveConversation } from '@/lib/ai/conversations'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get('includeArchived') === '1'

  try {
    const conversations = await listConversations(supabase, user.id, { includeArchived })
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

/** Restaura una conversación archivada para que vuelva a aparecer en "Chats activos". */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (typeof body.conversationId !== 'string' || !body.conversationId) {
    return NextResponse.json({ error: 'conversationId es requerido.' }, { status: 400 })
  }

  try {
    await unarchiveConversation(supabase, user.id, body.conversationId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    // 23505: el cliente ya tiene otro chat activo. Hay que archivarlo antes de restaurar este.
    const code = (error as { code?: string } | null)?.code
    if (code === '23505') {
      return NextResponse.json(
        { error: 'Este cliente ya tiene un chat activo. Archivalo primero para poder restaurar este.' },
        { status: 409 },
      )
    }
    console.error('[v0] Conversation restore failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo restaurar el chat.' }, { status: 500 })
  }
}

/** Resetea el chat: archiva la conversación activa para que el próximo turno arranque una nueva, vacía. */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (typeof body.conversationId !== 'string' || !body.conversationId) {
    return NextResponse.json({ error: 'conversationId es requerido.' }, { status: 400 })
  }

  try {
    // archiveConversation filtra por user_id, así que un usuario nunca puede
    // resetear un chat que no le pertenece.
    await archiveConversation(supabase, user.id, body.conversationId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] Conversation reset failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo resetear el chat.' }, { status: 500 })
  }
}
