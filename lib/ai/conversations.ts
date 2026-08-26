import type { SupabaseClient } from '@supabase/supabase-js'
import { ConversationWorkingContextSchema, type ConversationWorkingContext } from './conversation-context'

type ConversationRow = {
  id: string
  user_id: string
  client_id: string
  title: string | null
  created_at: string
  updated_at: string
}

type MessageRole = 'user' | 'assistant'

const CONVERSATION_COLUMNS = 'id, user_id, client_id, title, created_at, updated_at'

/**
 * Hay como máximo un chat activo por (usuario, cliente) — lo garantiza el
 * índice único `ai_conversations_one_active_per_client` en la base. Por eso
 * esta función ignora cualquier `conversationId` suelto: el chat siempre se
 * resuelve por cliente, nunca por id de conversación puntual.
 */
export async function getOrCreateConversation(supabase: SupabaseClient, userId: string, clientId: string) {
  const { data: existing, error: existingError } = await supabase
    .from('ai_conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) return existing as ConversationRow

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: userId, client_id: clientId, title: null })
    .select(CONVERSATION_COLUMNS)
    .single()

  if (error) {
    // 23505 = unique_violation: otra request creó el chat de este cliente
    // justo antes que esta. En vez de fallar, recuperamos la fila que ganó
    // la carrera.
    if (error.code === '23505') {
      const { data: winner, error: winnerError } = await supabase
        .from('ai_conversations')
        .select(CONVERSATION_COLUMNS)
        .eq('user_id', userId)
        .eq('client_id', clientId)
        .eq('archived', false)
        .single()
      if (winnerError) throw winnerError
      return winner as ConversationRow
    }
    throw error
  }
  return data as ConversationRow
}

export async function saveConversationMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string
    userId: string
    role: MessageRole
  content: string
    messageData?: Record<string, unknown>
  }
) {
  const { error } = await supabase.from('ai_messages').insert({
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content,
    ...(input.messageData ? { message_data: input.messageData } : {}),
  })

  if (error) throw error

  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversationId)
    .eq('user_id', input.userId)
}

export async function getLatestWorkingContext(supabase: SupabaseClient, conversationId: string, clientId: string) {
  const { data, error } = await supabase.from('ai_messages').select('message_data, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  for (const row of data ?? []) {
    const candidate = row.message_data && typeof row.message_data === 'object' && 'context_snapshot' in row.message_data ? (row.message_data as Record<string, unknown>).context_snapshot : null
    const parsed = ConversationWorkingContextSchema.safeParse(candidate)
    if (parsed.success && parsed.data.client_id === clientId) return parsed.data
  }
  return null
}

export interface ConversationSummary {
  id: string
  clientId: string
  clientName: string
  updatedAt: string
  lastMessagePreview: string | null
  lastMessageRole: MessageRole | null
}

export async function listActiveConversations(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConversationSummary[]> {
  const { data: conversations, error } = await supabase
    .from('ai_conversations')
    .select('id, client_id, updated_at, clientes(nombre_del_negocio)')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) throw error
  const rows = conversations ?? []
  if (rows.length === 0) return []

  const { data: lastMessages, error: messagesError } = await supabase
    .from('ai_messages')
    .select('conversation_id, content, role, created_at')
    .in('conversation_id', rows.map((row) => row.id))
    .order('created_at', { ascending: false })

  if (messagesError) throw messagesError

  // Nos quedamos con el primer mensaje que aparece por conversation_id: como
  // vienen ordenados desc por created_at, es el más reciente.
  const previewByConversation = new Map<string, { content: string; role: MessageRole }>()
  for (const message of lastMessages ?? []) {
    if (!previewByConversation.has(message.conversation_id)) {
      previewByConversation.set(message.conversation_id, { content: message.content, role: message.role })
    }
  }

  return rows.map((row) => {
    const clientRelation = row.clientes as { nombre_del_negocio: string | null } | { nombre_del_negocio: string | null }[] | null
    const client = Array.isArray(clientRelation) ? clientRelation[0] : clientRelation
    const preview = previewByConversation.get(row.id)
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: client?.nombre_del_negocio ?? 'Cliente sin nombre',
      updatedAt: row.updated_at,
      lastMessagePreview: preview?.content ?? null,
      lastMessageRole: preview?.role ?? null,
    }
  })
}

export async function listConversationMessages(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  options?: { limit?: number },
) {
  // La verificación de que `conversationId` le pertenece a `userId` (y al
  // client_id correspondiente) ya se hizo en getOrCreateConversation antes
  // de llegar acá — este helper confía en ese chequeo previo.
  if (options?.limit) {
    // Para no cargar conversaciones enteras en memoria (ventana de
    // contexto V1), traemos las últimas `limit` filas en orden
    // descendente y las revertimos para conservar el orden cronológico
    // ascendente (más antiguo primero) que espera tanto el modelo como la UI.
    const { data, error } = await supabase
      .from('ai_messages')
      .select('id, role, content, message_data, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(options.limit)

    if (error) throw error
    return (data ?? []).reverse()
  }

  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content, message_data, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}
