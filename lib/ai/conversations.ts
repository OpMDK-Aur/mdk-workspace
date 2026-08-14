import type { SupabaseClient } from '@supabase/supabase-js'

type ConversationRow = {
  id: string
  user_id: string
  client_id: string
  title: string | null
  created_at: string
  updated_at: string
}

type MessageRole = 'user' | 'assistant'

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  conversationId?: string | null,
) {
  if (conversationId) {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id, user_id, client_id, title, created_at, updated_at')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (error) throw error
    if (data) return data as ConversationRow
  }

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, client_id: clientId, title: null })
    .select('id, user_id, client_id, title, created_at, updated_at')
    .single()

  if (error) throw error
  return data as ConversationRow
}

export async function saveConversationMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string
    userId: string
    role: MessageRole
    content: string
  },
) {
  const { error } = await supabase.from('ai_messages').insert({
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content,
  })

  if (error) throw error

  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversationId)
    .eq('user_id', input.userId)
}

export async function listConversationMessages(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}
