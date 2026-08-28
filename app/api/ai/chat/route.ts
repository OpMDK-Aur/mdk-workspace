import { NextResponse } from 'next/server'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import * as XLSX from 'xlsx'
import type { ActivityEvent } from '@/lib/ai/types'
import { createClient } from '@/lib/supabase/server'
import { chatRequestSchema } from '@/lib/ai/config/fallback'
import { streamSupervisorResponse, type SupervisorModelMessage } from '@/lib/ai/agents/supervisor'
import { getOrCreateConversation, getLatestWorkingContext, listConversationMessages, saveConversationMessage } from '@/lib/ai/conversations'
import { emptyWorkingContext } from '@/lib/ai/conversation-context'
import { ATTACHMENT_MAX_COUNT, isImageOrPdfAttachment, isPlainTextAttachment, isSpreadsheetAttachment } from '@/lib/ai/attachments'

export const maxDuration = 60

// El stream debe fallar antes del límite de Vercel para que el cliente reciba un error visible.
const SUPERVISOR_TIMEOUT_MS = 52_000

// Ventana de memoria conversacional V1: cantidad máxima de mensajes
// persistidos (user + assistant) que se recuperan de ai_messages para
// darle contexto al Supervisor en cada turno. Evita cargar conversaciones
// completas indefinidamente; una estrategia de resumen (ai_conversations.summary)
// puede reemplazar esto más adelante para conversaciones largas.
const CONVERSATION_HISTORY_WINDOW = 20

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getComparisonDefinition(query: string) {
  const asksForComparison = /\b(compar[áa]|vs\.?|contra|aument[oó]|subi[oó]|baj[oó]|cay[oó]|mejor[oó]|empeor[oó]|creci[oó]|deterior|cambi[oó]|por qu[eé] aument|por qu[eé] baj)/i.test(query)
  const daysMatch = query.match(/(?:últimos?|ultimos?)\s+(\d+)\s+d[ií]as/i)
  if (!asksForComparison || !daysMatch) return undefined
  const days = Number(daysMatch[1])
  if (!Number.isInteger(days) || days < 1 || days > 365) return undefined
  const currentTo = new Date()
  const currentFrom = new Date(currentTo)
  currentFrom.setUTCDate(currentFrom.getUTCDate() - days + 1)
  const comparisonTo = new Date(currentFrom)
  comparisonTo.setUTCDate(comparisonTo.getUTCDate() - 1)
  const comparisonFrom = new Date(comparisonTo)
  comparisonFrom.setUTCDate(comparisonFrom.getUTCDate() - days + 1)
  return {
    type: 'previous_period' as const,
    current: { from: isoDate(currentFrom), to: isoDate(currentTo) },
    comparison: { from: isoDate(comparisonFrom), to: isoDate(comparisonTo) },
  }
}

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

type IncomingFilePart = { type: 'file'; mediaType: string; filename?: string; url: string }

// Los archivos adjuntos llegan como parts type="file" (FileUIPart) dentro del
// último mensaje del usuario. Sólo miramos el último mensaje: los adjuntos de
// turnos anteriores ya quedaron resueltos (texto inyectado o referenciados) en
// la respuesta que el Supervisor dio en su momento.
function getMessageFileParts(message: unknown): IncomingFilePart[] {
  if (!message || typeof message !== 'object') return []
  const parts = 'parts' in message && Array.isArray(message.parts) ? message.parts : []
  return parts
    .filter((part): part is IncomingFilePart =>
      Boolean(
        part &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'file' &&
          'url' in part &&
          typeof (part as { url?: unknown }).url === 'string',
      ),
    )
    .slice(0, ATTACHMENT_MAX_COUNT)
    .map((part) => ({
      type: 'file' as const,
      mediaType: typeof part.mediaType === 'string' && part.mediaType ? part.mediaType : 'application/octet-stream',
      filename: typeof part.filename === 'string' ? part.filename : undefined,
      url: part.url,
    }))
}

type AttachmentContentPart = { type: 'text'; text: string } | { type: 'file'; data: string; mediaType: string; filename?: string }
type AttachmentMeta = { filename: string; mediaType: string; url: string }

const ATTACHMENT_TEXT_CHAR_LIMIT = 20_000

/**
 * Convierte cada archivo adjunto en algo que el modelo pueda consumir:
 * - imágenes/PDF: parte de archivo multimodal (el modelo la "ve" directamente).
 * - csv/txt/tsv/json: se lee el texto y se inyecta como contexto adicional.
 * - xlsx/xls: se parsea con la librería xlsx y se convierte cada hoja a CSV.
 * - cualquier otro formato: se avisa al modelo que no pudo leerse automáticamente.
 */
async function resolveAttachmentParts(files: IncomingFilePart[]): Promise<{ contentParts: AttachmentContentPart[]; attachmentsMeta: AttachmentMeta[] }> {
  const contentParts: AttachmentContentPart[] = []
  const attachmentsMeta: AttachmentMeta[] = []

  for (const file of files) {
    const filename = file.filename || 'archivo adjunto'
    const mediaType = file.mediaType
    attachmentsMeta.push({ filename, mediaType, url: file.url })

    if (isImageOrPdfAttachment(mediaType, filename)) {
      contentParts.push({ type: 'file', data: file.url, mediaType, filename })
      continue
    }

    if (isPlainTextAttachment(mediaType, filename)) {
      try {
        const response = await fetch(file.url)
        if (!response.ok) throw new Error(`status ${response.status}`)
        const text = await response.text()
        contentParts.push({ type: 'text', text: `Contenido del archivo adjunto "${filename}":\n\n${text.slice(0, ATTACHMENT_TEXT_CHAR_LIMIT)}` })
      } catch (error) {
        console.error('[v0] Attachment text read failed:', filename, error instanceof Error ? error.message : error)
        contentParts.push({ type: 'text', text: `No se pudo leer el contenido del archivo adjunto "${filename}".` })
      }
      continue
    }

    if (isSpreadsheetAttachment(mediaType, filename)) {
      try {
        const response = await fetch(file.url)
        if (!response.ok) throw new Error(`status ${response.status}`)
        const buffer = Buffer.from(await response.arrayBuffer())
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const csvBySheet = workbook.SheetNames.map(
          (sheetName) => `Hoja "${sheetName}":\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`,
        ).join('\n\n')
        contentParts.push({ type: 'text', text: `Contenido del archivo adjunto "${filename}" (convertido a CSV):\n\n${csvBySheet.slice(0, ATTACHMENT_TEXT_CHAR_LIMIT)}` })
      } catch (error) {
        console.error('[v0] Attachment spreadsheet parse failed:', filename, error instanceof Error ? error.message : error)
        contentParts.push({ type: 'text', text: `No se pudo leer el contenido del archivo adjunto "${filename}".` })
      }
      continue
    }

    contentParts.push({
      type: 'text',
      text: `El usuario adjuntó el archivo "${filename}" pero su formato no puede leerse automáticamente. Si necesitás sus datos para responder, pedile que comparta la información como texto, CSV o Excel.`,
    })
  }

  return { contentParts, attachmentsMeta }
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
    // AI SDK puede enviar campos adicionales del transporte en el body raíz.
    // Normalizamos ambas formas para que el contexto del cliente nunca se pierda.
    const normalizedBody = {
      ...body,
      context: body?.context ?? {
        ...(body?.clientId ? { clientId: body.clientId } : {}),
        ...(body?.conversationId ? { conversationId: body.conversationId } : {}),
        ...(body?.scoreConfig ? { scoreConfig: body.scoreConfig } : {}),
      },
    }
    const parsed = chatRequestSchema.safeParse(normalizedBody)

    if (!parsed.success) {
      console.error('[v0] AI request validation failed:', parsed.error.flatten())
      return NextResponse.json(
        { error: 'La conversación no es válida.', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const lastMessage = parsed.data.messages.at(-1)
    const fileParts = getMessageFileParts(lastMessage)
    // Si el usuario sólo adjuntó archivos sin escribir texto, igual mandamos
    // un mensaje con contenido (así queda algo legible en el historial y el
    // Supervisor sabe que debe mirar los adjuntos).
    const query = getMessageText(lastMessage) || (fileParts.length > 0 ? 'Adjunto archivo(s) para análisis.' : '')
    if (!query) {
      return NextResponse.json({ error: 'El último mensaje debe contener texto.' }, { status: 400 })
    }

    const { contentParts: attachmentContentParts, attachmentsMeta } = await resolveAttachmentParts(fileParts)

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
    const activeClientId = context.clientId
    const workingContext = conversation && activeClientId
      ? (await getLatestWorkingContext(supabase, conversation.id, activeClientId)) ?? emptyWorkingContext(activeClientId)
      : activeClientId ? emptyWorkingContext(activeClientId) : null
    if (workingContext) {
      console.log('[v0] Conversation working context recovered', { platforms: workingContext.platforms, accountIds: workingContext.account_ids, referencedChanges: workingContext.referenced_change_events.length })
    }

    if (conversation) {
      await saveConversationMessage(supabase, {
        conversationId: conversation.id,
        userId: user.id,
        role: 'user',
        content: query,
        ...(attachmentsMeta.length > 0 ? { messageData: { attachments: attachmentsMeta } } : {}),
      })
    }

    // Mensajes que ve el modelo: historial persistido + la consulta actual
    // al final. Las filas de ai_messages ya tienen el formato { role, content }
    // esperado por streamText (no son UIMessage con "parts", así que no
    // necesitan convertToModelMessages). El turno actual puede llevar además
    // partes multimodales (imagen/PDF) o texto extraído de CSV/Excel cuando
    // el usuario adjuntó archivos.
    const currentUserContent = attachmentContentParts.length > 0 ? [{ type: 'text' as const, text: query }, ...attachmentContentParts] : query
    const modelMessages: SupervisorModelMessage[] = [
      ...history.map((message) => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: currentUserContent },
    ]

    console.log('[v0] Supervisor starting:', {
      userId: user.id,
      messageCount: parsed.data.messages.length,
      historyMessageCount: history.length,
      conversationId: conversation?.id ?? null,
    })
    // AnalysisRunState es efímero y vive únicamente durante este request.
    // No es memoria conversacional y nunca se persiste en Supabase.
    const analysisRunState: import('@/lib/ai/contracts/performance-analyst').AnalysisRunState = {
      currentSnapshots: [],
      comparisonSnapshots: [],
      changeHistory: [],
      specialistOutputs: [],
      comparisonDefinition: getComparisonDefinition(query),
    }
    let writeActivity: ((event: ActivityEvent) => void) | undefined
    const resultStream = createUIMessageStream({
      execute: async ({ writer }) => {
        writeActivity = (event) => writer.write({ type: 'data-activity', id: 'activity-status', data: event, transient: true })
        const supervisorTimeout = setTimeout(() => writeActivity?.({ eventId: crypto.randomUUID(), agentSlug: 'supervisor', status: 'error', label: 'La respuesta tardó demasiado. Probá nuevamente.', timestamp: new Date().toISOString() }), SUPERVISOR_TIMEOUT_MS)
        let result
        try {
          result = await streamSupervisorResponse(modelMessages, {
            userId: user.id,
            userEmail: user.email,
            ...context,
            analysisRunState,
            conversationWorkingContext: workingContext ?? undefined,
            emitActivity: (event) => writeActivity?.({
              ...event,
              eventId: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }),
          })
        } finally {
          clearTimeout(supervisorTimeout)
        }
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
          messageData: {
            ...(workingContext ? { context_snapshot: workingContext } : {}),
            ...(analysisRunState.specialistOutputs.at(-1) ? { performance_analysis: analysisRunState.specialistOutputs.at(-1) } : {}),
          },
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
