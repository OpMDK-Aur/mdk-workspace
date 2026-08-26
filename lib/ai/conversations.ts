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

/**
 * Archiva el chat activo de un cliente para "resetearlo": libera el slot
 * único (user_id, client_id) para que la próxima consulta de
 * getOrCreateConversation cree una conversación nueva y vacía. El historial
 * archivado no se borra, solo deja de ser el chat activo.
 */
export async function archiveConversation(supabase: SupabaseClient, userId: string, conversationId: string) {
  const { error } = await supabase
    .from('ai_conversations')
    .update({ archived: true })
    .eq('id', conversationId)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * Desarchiva una conversación para volver a mostrarla en "Chats activos".
 * Si el cliente ya tiene otro chat activo (porque se creó uno nuevo después
 * de archivar este), el índice único `ai_conversations_one_active_per_client`
 * rechaza la operación con 23505: en ese caso no hay nada seguro que hacer
 * automáticamente, así que dejamos que el error suba y el llamador informe
 * que hay que archivar el chat activo actual antes de restaurar este.
 */
export async function unarchiveConversation(supabase: SupabaseClient, userId: string, conversationId: string) {
  const { error } = await supabase
    .from('ai_conversations')
    .update({ archived: false })
    .eq('id', conversationId)
    .eq('user_id', userId)

  if (error) throw error
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
  /** Último optimization_score que dejó el Performance Analyst en esta conversación, si ya corrió al menos un análisis. */
  optimizationScore: number | null
  archived: boolean
  unidadesNegocio: string[]
  /** Peor semáforo entre las unidades de negocio del cliente (rojo > naranja > amarillo > verde), o null si no tiene definido. */
  semaforo: string | null
  projectManagerId: string | null
  projectManagerName: string | null
  accountManagerId: string | null
  accountManagerName: string | null
}

const SEMAFORO_SEVERITY: Record<string, number> = { rojo: 4, naranja: 3, amarillo: 2, verde: 1 }

function worstSemaforo(semaforoUnidades: Record<string, string> | null, unidades: string[] | null): string | null {
  if (!semaforoUnidades) return null
  const keys = unidades && unidades.length > 0 ? unidades : Object.keys(semaforoUnidades)
  const relevant = keys.map((key) => semaforoUnidades[key]).filter((value): value is string => typeof value === 'string')
  if (relevant.length === 0) return null
  return relevant.reduce((worst, current) => ((SEMAFORO_SEVERITY[current] ?? 0) > (SEMAFORO_SEVERITY[worst] ?? 0) ? current : worst))
}

export interface ListConversationsOptions {
  /** Por default sólo se listan los chats activos (no archivados). */
  includeArchived?: boolean
}

export async function listConversations(
  supabase: SupabaseClient,
  userId: string,
  options?: ListConversationsOptions,
): Promise<ConversationSummary[]> {
  let query = supabase
    .from('ai_conversations')
    .select(
      'id, client_id, updated_at, archived, clientes(nombre_del_negocio, unidades_negocio, semaforo_unidades, project_manager_id, account_manager_id)',
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (!options?.includeArchived) query = query.eq('archived', false)

  const { data: conversations, error } = await query

  if (error) throw error
  const rows = conversations ?? []
  if (rows.length === 0) return []

  const { data: lastMessages, error: messagesError } = await supabase
    .from('ai_messages')
    .select('conversation_id, content, role, message_data, created_at')
    .in('conversation_id', rows.map((row) => row.id))
    .order('created_at', { ascending: false })

  if (messagesError) throw messagesError

  // Nos quedamos con el primer mensaje que aparece por conversation_id: como
  // vienen ordenados desc por created_at, es el más reciente.
  const previewByConversation = new Map<string, { content: string; role: MessageRole }>()
  // El score puede venir de un mensaje del asistente anterior al último
  // (p. ej. si la última respuesta no disparó un nuevo análisis), así que lo
  // buscamos por separado recorriendo todos los mensajes ya ordenados desc.
  const scoreByConversation = new Map<string, number>()
  for (const message of lastMessages ?? []) {
    if (!previewByConversation.has(message.conversation_id)) {
      previewByConversation.set(message.conversation_id, { content: message.content, role: message.role })
    }
    if (!scoreByConversation.has(message.conversation_id) && message.role === 'assistant') {
      const messageData = message.message_data as { performance_analysis?: { optimization_score?: number | null } } | null
      const score = messageData?.performance_analysis?.optimization_score
      if (typeof score === 'number') scoreByConversation.set(message.conversation_id, score)
    }
  }

  type ClientRelation = {
    nombre_del_negocio: string | null
    unidades_negocio: string[] | null
    semaforo_unidades: Record<string, string> | null
    project_manager_id: string | null
    account_manager_id: string | null
  }
  const clientByConversation = new Map<string, ClientRelation | null>()
  const managerIds = new Set<string>()
  for (const row of rows) {
    const clientRelation = row.clientes as ClientRelation | ClientRelation[] | null
    const client = Array.isArray(clientRelation) ? clientRelation[0] ?? null : clientRelation
    clientByConversation.set(row.id, client)
    if (client?.project_manager_id) managerIds.add(client.project_manager_id)
    if (client?.account_manager_id) managerIds.add(client.account_manager_id)
  }

  // project_manager_id / account_manager_id en clientes referencian colaboradores(id),
  // no profiles(id): el nombre completo se compone de nombre + apellido, igual que en
  // app/dashboard/platform/page.tsx y app/dashboard/agentes/controller/page.tsx.
  const managerNameById = new Map<string, string>()
  if (managerIds.size > 0) {
    const { data: managers, error: managersError } = await supabase
      .from('colaboradores')
      .select('id, nombre, apellido')
      .in('id', Array.from(managerIds))
    if (managersError) throw managersError
    for (const manager of managers ?? []) {
      const fullName = `${manager.nombre || ''}${manager.apellido ? ' ' + manager.apellido : ''}`.trim()
      if (fullName) managerNameById.set(manager.id, fullName)
    }
  }

  return rows.map((row) => {
    const client = clientByConversation.get(row.id) ?? null
    const preview = previewByConversation.get(row.id)
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: client?.nombre_del_negocio ?? 'Cliente sin nombre',
      updatedAt: row.updated_at,
      lastMessagePreview: preview?.content ?? null,
      lastMessageRole: preview?.role ?? null,
      optimizationScore: scoreByConversation.get(row.id) ?? null,
      archived: row.archived,
      unidadesNegocio: client?.unidades_negocio ?? [],
      semaforo: worstSemaforo(client?.semaforo_unidades ?? null, client?.unidades_negocio ?? null),
      projectManagerId: client?.project_manager_id ?? null,
      projectManagerName: client?.project_manager_id ? managerNameById.get(client.project_manager_id) ?? null : null,
      accountManagerId: client?.account_manager_id ?? null,
      accountManagerName: client?.account_manager_id ? managerNameById.get(client.account_manager_id) ?? null : null,
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
