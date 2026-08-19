import { NextResponse } from 'next/server'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import type { ActivityEvent } from '@/lib/ai/types'
import { createClient } from '@/lib/supabase/server'
import { chatRequestSchema } from '@/lib/ai/config/fallback'
import { streamSupervisorResponse, type SupervisorModelMessage } from '@/lib/ai/agents/supervisor'
import { getOrCreateConversation, listConversationMessages, saveConversationMessage } from '@/lib/ai/conversations'

export const maxDuration = 60

// Ventana de memoria conversacional V1: cantidad máxima de mensajes
// persistidos (user + assistant) que se recuperan de ai_messages para
// darle contexto al Supervisor en cada turno. Evita cargar conversaciones
// completas indefinidamente; una estrategia de resumen (ai_conversations.summary)
// puede reemplazar esto más adelante para conversaciones largas.
const CONVERSATION_HISTORY_WINDOW = 20

function getMessageText(message: unknown) {
  if (!message || typeof message !== 'object') return ''
  const parts = 'parts' in message && Array.isArray(message.parts) ? message.parts : []
  return parts
    .filter((part): part is { type: 'text'; text: string } =>
      Boolean(part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string'),
    )
    .map((part) => part.text)
    .join('')
    .trim()
}

export async function POST(request: Request) {
  console.log('[v0] AI request received')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.log('[v0] AI request rejected: unauthenticated')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[v0] AI user authenticated:', user.id)

  try {
    const body = await request.json()
    const parsed = chatRequestSchema.safeParse(body)

    if (!parsed.success) {
      console.error('[v0] AI request validation failed:', parsed.error.flatten())
      return NextResponse.json(
        { error: 'La conversación no es válida.', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const query = getMessageText(parsed.data.messages.at(-1))
    if (!query) {
      return NextResponse.json({ error: 'El último mensaje debe contener texto.' }, { status: 400 })
    }

    const context = parsed.data.context
    // getOrCreateConversation valida server-side que la conversación (si se
    // pasó un conversationId) pertenezca a este user_id + client_id antes de
    // devolverla. Si no coincide (otro usuario u otro cliente), la búsqueda
    // no encuentra filas y se crea una conversación nueva — nunca se expone
    // el historial de una conversación ajena.
    const conversation = context.clientId
      ? await getOrCreateConversation(supabase, user.id, context.clientId, context.conversationId)
      : null

    // IMPORTANTE: recuperamos el historial ANTES de persistir el mensaje del
    // usuario actual, para no duplicarlo. `history` queda con los últimos
    // CONVERSATION_HISTORY_WINDOW mensajes previos (user/assistant), en
    // orden cronológico ascendente (más antiguo primero).
    const history = conversation
      ? await listConversationMessages(supabase, user.id, conversation.id, { limit: CONVERSATION_HISTORY_WINDOW })
      : []

    if (conversation) {
      await saveConversationMessage(supabase, {
        conversationId: conversation.id,
        userId: user.id,
        role: 'user',
        content: query,
      })
    }

    // Mensajes que ve el modelo: historial persistido + la consulta actual
    // al final. Las filas de ai_messages ya tienen el formato { role, content }
    // esperado por streamText (no son UIMessage con "parts", así que no
    // necesitan convertToModelMessages).
    const modelMessages: SupervisorModelMessage[] = [
      ...history.map((message) => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: query },
    ]

    console.log('[v0] Supervisor starting:', {
      userId: user.id,
      messageCount: parsed.data.messages.length,
      historyMessageCount: history.length,
      conversationId: conversation?.id ?? null,
    })
    let writeActivity: ((event: ActivityEvent) => void) | undefined
    const resultStream = createUIMessageStream({
      execute: async ({ writer }) => {
        writeActivity = (event) => writer.write({ type: 'data-activity', id: 'activity-status', data: event, transient: true })
        const result = await streamSupervisorResponse(modelMessages, {
          userId: user.id,
          userEmail: user.email,
          ...context,
          emitActivity: (event) => writeActivity?.({
            ...event,
            eventId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
          }),
        })
        writeActivity?.({ eventId: crypto.randomUUID(), agentSlug: 'supervisor', status: 'running', label: 'Preparando respuesta...', timestamp: new Date().toISOString() })
        writer.merge(result.toUIMessageStream())
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'No se pudo completar la respuesta del Supervisor.'
        writeActivity?.({ eventId: crypto.randomUUID(), agentSlug: 'supervisor', status: 'error', label: message, timestamp: new Date().toISOString() })
        return message
      },
      onFinish: async ({ messages }) => {
        if (!conversation) return
        const assistantMessage = messages.at(-1)
        const assistantText = getMessageText(assistantMessage)
        if (!assistantText) return
        await saveConversationMessage(supabase, {
          conversationId: conversation.id,
          userId: user.id,
          role: 'assistant',
          content: assistantText,
        })
      },
    })
    console.log('[v0] AI Gateway call initiated')

    const response = createUIMessageStreamResponse({ stream: resultStream })
    console.log('[v0] UI message streaming started')
    return response
  } catch (error) {
    console.error('[v0] AI streaming failed:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json(
      { error: 'No se pudo procesar la conversación del Supervisor.' },
      { status: 500 },
    )
  }
}
