'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import useSWR from 'swr'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowUpRight, Check, ChevronRight, FileText, Loader2, MoreHorizontal, Paperclip, Pencil, Send, Sparkles, Square, X } from 'lucide-react'
import { toast } from 'sonner'
import { ChartSkeleton, ChatChart } from '@/components/conexa/chat-chart'
import { parseChartSpec, type ChartSpec } from '@/lib/ai/chart-spec'
import { asksForValidation, buildClaudeReportPrompt, isMonthlyReportRequest, REPORT_CONFIRMATION_PATTERN } from '@/lib/ai/monthly-report'
import { cn } from '@/lib/utils'
import { MessageContent } from '@/components/chat/message-content'
import { CopyButton } from '@/components/chat/copy-button'
import type { ActivityEvent } from '@/lib/ai/types'
import { ATTACHMENT_ACCEPT_ATTRIBUTE, ATTACHMENT_MAX_COUNT, ATTACHMENT_MAX_SIZE_BYTES, isAttachmentMimeTypeAllowed } from '@/lib/ai/attachments'

const FALLBACK_QUESTIONS = [
  'Dame el prompt para el informe mensual',
  'Decime qué campañas tuvieron mejor performance en los últimos 7 días',
  'Qué anuncios son los que debería apagar por baja performance',
]

const fetchRecentQuestions = async (url: string): Promise<string[]> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudieron cargar las sugerencias.')
  const data = (await response.json()) as { questions?: string[] }
  return data.questions ?? []
}

type HistoryConversation = { id: string; updatedAt: string; lastMessagePreview: string | null }

const fetchClientHistory = async (url: string): Promise<HistoryConversation[]> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudo cargar el historial.')
  const data = (await response.json()) as { conversations?: HistoryConversation[] }
  return data.conversations ?? []
}

function historySectionLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Hoy'
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer'
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

interface ConexaChatProps {
  clientId: string | null
  clientName: string
  /** Se incrementa desde afuera para forzar el reset del chat activo. */
  resetSignal: number
  onCreateReport?: (content: string) => void
  model?: string
  /** Id(s) de cuenta de Meta Ads del cliente (separados por coma si son varios). */
  metaAccountId?: string
  /** Id(s) de cuenta de Google Ads del cliente (separados por coma si son varios). */
  googleCustomerId?: string
  analyticsPropertyId?: string
}

type PersistedMessage = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

const RENDER_CHART_PART = 'tool-renderChart'
const PERSISTED_CHART_FENCE = /```(?:conexa-chart|chart)[ \t]*\r?\n([\s\S]*?)```/g

function hasRenderChartPart(message: UIMessage) {
  return message.parts.some((part) => part.type === RENDER_CHART_PART)
}

function messageCharts(message: UIMessage): ChartSpec[] {
  const fromTools = message.parts.flatMap((part) =>
    part.type === RENDER_CHART_PART && 'state' in part && part.state === 'output-available' && 'output' in part
      ? [parseChartSpec(part.output)]
      : [],
  )
  const fromText = [...messageText(message).matchAll(PERSISTED_CHART_FENCE)].map((match) => {
    try {
      return parseChartSpec(JSON.parse(match[1]))
    } catch {
      return null
    }
  })
  return [...fromTools, ...fromText].filter((spec): spec is ChartSpec => spec !== null)
}

type ReportConfirmation = { reportConfirmed: boolean; messageId: string }

/**
 * Aviso de dos tonos suave (estilo notificación de mensaje) generado con
 * Web Audio API, sin depender de un archivo de audio externo.
 */
function playNotificationChime() {
  if (typeof window === 'undefined') return
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  const ctx = new AudioCtx()

  function tone(frequency: number, startTime: number, duration: number) {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration)
  }

  const now = ctx.currentTime
  tone(880, now, 0.16)
  tone(1318.5, now + 0.12, 0.22)
  window.setTimeout(() => ctx.close(), 500)
}

/**
 * Wrapper que resuelve/crea la conversación real del cliente (una por
 * cliente, igual que en /ai) antes de montar la sesión de chat. El
 * `key` en ConexaChatSession fuerza un remount completo cuando cambia el
 * cliente o la conversación activa (p. ej. tras un reset), evitando el
 * problema conocido de useChat de no releer `messages` en caliente.
 */
export function ConexaSupervisorChat(props: ConexaChatProps) {
  const { clientId, resetSignal } = props
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<PersistedMessage[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [openConversationId, setOpenConversationId] = useState<string | null>(null)
  const lastResetSignal = useRef(resetSignal)

  useEffect(() => {
    if (!clientId) {
      setConversationId(null)
      setHistory([])
      return
    }

    let cancelled = false
    setIsLoadingHistory(true)
    fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, ...(openConversationId ? { openConversationId } : {}) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la conversación.')
        return response.json() as Promise<{ conversation: { id: string }; messages: PersistedMessage[] }>
      })
      .then((data) => {
        if (cancelled) return
        setConversationId(data.conversation.id)
        setHistory(data.messages)
      })
      .catch(() => {
        if (!cancelled) {
          setConversationId(null)
          setHistory([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingHistory(false)
          setIsResetting(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [clientId, refreshToken])

  useEffect(() => {
    setOpenConversationId(null)
  }, [clientId])

  function handleOpenConversation(id: string) {
    if (id === conversationId || isResetting) return
    setOpenConversationId(id)
    setRefreshToken((value) => value + 1)
  }

  async function handleReset() {
    if (!conversationId || isResetting) return
    setIsResetting(true)
    setOpenConversationId(null)
    try {
      await fetch('/api/ai/conversations', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
    } catch {
      // Si falla el archivado, igual reintentamos el refetch abajo.
    }
    setRefreshToken((value) => value + 1)
  }

  useEffect(() => {
    if (resetSignal !== lastResetSignal.current) {
      lastResetSignal.current = resetSignal
      handleReset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  if (!clientId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[#9a9a9a]">
        Seleccioná un cliente para empezar a chatear con Conexa.
      </div>
    )
  }

  if (isLoadingHistory) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[#9a9a9a]">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Cargando conversación…
      </div>
    )
  }

  return (
    <ConexaChatSession
      key={conversationId ?? `new-${clientId}`}
      {...props}
      conversationId={conversationId}
      initialMessages={history}
      onReset={handleReset}
      onOpenConversation={handleOpenConversation}
      isResetting={isResetting}
    />
  )
}

function ConexaChatSession({
  clientId,
  clientName,
  onCreateReport,
  model,
  metaAccountId,
  googleCustomerId,
  analyticsPropertyId,
  conversationId,
  initialMessages,
  onReset,
  onOpenConversation,
  isResetting,
}: ConexaChatProps & {
  conversationId: string | null
  initialMessages: PersistedMessage[]
  onReset: () => void
  onOpenConversation: (id: string) => void
  isResetting: boolean
}) {
  const [input, setInput] = useState('')
  const [currentActivity, setCurrentActivity] = useState<ActivityEvent | null>(null)
  const [activitySteps, setActivitySteps] = useState<ActivityEvent[]>([])
  const [requestError, setRequestError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [reportConfirmation, setReportConfirmation] = useState<ReportConfirmation | null>(null)
  const [isCorrectingReport, setIsCorrectingReport] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const persistedMessages: UIMessage[] = initialMessages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
  }))

  function buildContext() {
    return clientId
      ? {
          clientId,
          ...(conversationId ? { conversationId } : {}),
          ...(model ? { model } : {}),
          ...(metaAccountId ? { metaAccountId } : {}),
          ...(googleCustomerId ? { googleCustomerId } : {}),
          ...(analyticsPropertyId ? { analyticsPropertyId } : {}),
        }
      : {}
  }

  const { messages, sendMessage, setMessages, stop, status, error } = useChat({
    messages: persistedMessages,
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { context: buildContext() },
    }),
    onData: (dataPart) => {
      if (dataPart.type !== 'data-activity') return
      const event = dataPart.data as ActivityEvent
      setCurrentActivity(event)
      setActivitySteps((previous) => {
        // Usamos agentSlug + toolKey (sin eventId) para que los pasos
        // genéricos del supervisor (sin toolKey, p. ej. "Preparando
        // respuesta...") se agrupen entre sí -incluyendo el paso optimista
        // que sembramos del lado del cliente al enviar- en vez de crear una
        // fila nueva por cada eventId único.
        const stepKey = `${event.agentSlug ?? 'supervisor'}:${event.toolKey ?? 'generic'}`
        const lastIndex = previous.length - 1
        // Si el último paso registrado corresponde a la misma acción y todavía
        // está en curso, lo actualizamos (running -> completed/error) en vez
        // de agregar una fila nueva.
        if (lastIndex >= 0 && previous[lastIndex].status === 'running') {
          const lastKey = `${previous[lastIndex].agentSlug ?? 'supervisor'}:${previous[lastIndex].toolKey ?? 'generic'}`
          if (lastKey === stepKey) {
            const next = [...previous]
            next[lastIndex] = event
            return next
          }
        }
        return [...previous, event]
      })
    },
  onError: (streamError) => {
  const rawMessage = streamError instanceof Error ? streamError.message : ''
  const message = /timeout|timed out|fetch failed|bad request|internal server|500|502|503/i.test(rawMessage)
  ? 'No pudimos completar la consulta en este momento. Podés reintentarla.'
  : rawMessage || 'No se pudo completar la respuesta.'
  setRequestError(message)
  setCurrentActivity({ eventId: 'client-error', agentSlug: 'supervisor', status: 'error', label: message, timestamp: new Date().toISOString() })
  },
  })

  const isBusy = status === 'submitted' || status === 'streaming'
  const lastMessage = messages.at(-1)
  const lastAssistantHasContent = lastMessage?.role === 'assistant' && (messageText(lastMessage).length > 0 || hasRenderChartPart(lastMessage))
  // AI SDK puede crear el mensaje assistant antes de recibir su primer token.
  // En ese instante no hay que ocultar el panel de actividad: hacerlo dejaba
  // una burbuja vacía, exactamente el estado que se veía cuando el stream
  // tardaba entre llamadas de tools.
  const isStreamingAssistantMessage = isBusy && lastAssistantHasContent
  const isWaitingForAssistantContent = isBusy && lastMessage?.role === 'assistant' && !lastAssistantHasContent
  const isMonthlyReport = messages.some((message) => message.role === 'user' && isMonthlyReportRequest(messageText(message)))
  const pendingValidationId =
    isMonthlyReport && !isBusy && lastMessage?.role === 'assistant' && asksForValidation(messageText(lastMessage)) && reportConfirmation?.messageId !== lastMessage.id
      ? lastMessage.id
      : null

  function confirmReport(messageId: string) {
    setReportConfirmation({ reportConfirmed: true, messageId })
    setIsCorrectingReport(false)
  }

  function startReportCorrection() {
    setIsCorrectingReport(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }
  const showActivityPanel = isBusy && (!isStreamingAssistantMessage || isWaitingForAssistantContent)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages.length, isBusy, currentActivity])

  // Suena un aviso corto cuando la IA termina de responder (transición
  // busy -> ready con un mensaje del asistente ya presente).
  const wasBusyRef = useRef(false)
  useEffect(() => {
    const justFinished = wasBusyRef.current && !isBusy && messages.at(-1)?.role === 'assistant'
    wasBusyRef.current = isBusy
    if (!justFinished) return
    playNotificationChime()
  }, [isBusy, messages])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Shift+Enter agrega salto de línea. No enviamos mientras el
    // usuario compone texto con un IME ni en el evento final de Safari (229).
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if ((!text && attachments.length === 0) || isBusy || !clientId) return
    const pendingAttachments = attachments
    setInput('')
    setRequestError(null)
    setAttachments([])
    setAttachmentError(null)
    setIsCorrectingReport(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    // Una confirmación escrita como respuesta a "¿La información es correcta?"
    // valida el resumen sin volver a consultar al modelo.
    if (pendingValidationId && pendingAttachments.length === 0 && REPORT_CONFIRMATION_PATTERN.test(text)) {
      setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }])
      confirmReport(pendingValidationId)
      return
    }
    // Cualquier mensaje nuevo puede cambiar los datos validados.
    setReportConfirmation(null)
    // Mostramos un primer paso de forma optimista, del lado del cliente, para
    // que el panel nunca muestre el "Pensando..." genérico mientras esperamos
    // la primera confirmación del servidor (que puede demorar por la latencia
    // de red o el arranque del stream).
    const optimisticStep: ActivityEvent = {
      eventId: 'client-optimistic',
      agentSlug: 'supervisor',
      status: 'running',
      label: 'Preparando respuesta...',
      timestamp: new Date().toISOString(),
    }
    setCurrentActivity(optimisticStep)
    setActivitySteps([optimisticStep])
    let files: FileList | undefined
    if (pendingAttachments.length > 0) {
      const dataTransfer = new DataTransfer()
      pendingAttachments.forEach((file) => dataTransfer.items.add(file))
      files = dataTransfer.files
    }
    await sendMessage({ text, ...(files ? { files } : {}) }, { body: { context: buildContext() } })
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const incoming = Array.from(fileList)
    setAttachmentError(null)

    const invalid = incoming.find((file) => !isAttachmentMimeTypeAllowed(file.type, file.name))
    if (invalid) {
      setAttachmentError(`El archivo "${invalid.name}" no tiene un formato admitido.`)
      return
    }
    const tooLarge = incoming.find((file) => file.size > ATTACHMENT_MAX_SIZE_BYTES)
    if (tooLarge) {
      setAttachmentError(`El archivo "${tooLarge.name}" supera el tamaño máximo permitido (15MB).`)
      return
    }
    setAttachments((previous) => {
      const combined = [...previous, ...incoming]
      if (combined.length > ATTACHMENT_MAX_COUNT) {
        setAttachmentError(`Podés adjuntar hasta ${ATTACHMENT_MAX_COUNT} archivos por mensaje.`)
        return previous
      }
      return combined
    })
  }

  function handleRemoveAttachment(index: number) {
    setAttachments((previous) => previous.filter((_, i) => i !== index))
    setAttachmentError(null)
  }

  // Permite reeditar el último mensaje del usuario: lo quita de la
  // conversación local (junto con lo que venga después) y lo vuelve a
  // cargar en el campo de texto para corregirlo antes de reenviarlo.
  function handleEditMessage(messageId: string) {
    if (isBusy) return
    const index = messages.findIndex((message) => message.id === messageId)
    if (index === -1) return
    const target = messages[index]
    if (target.role !== 'user') return
    setInput(messageText(target))
    setMessages((previous) => previous.slice(0, index))
    setReportConfirmation(null)
    setRequestError(null)
    requestAnimationFrame(() => {
      const field = textareaRef.current
      if (!field) return
      field.style.height = 'auto'
      field.style.height = `${Math.min(field.scrollHeight, 160)}px`
      field.focus()
    })
  }

  function handleSuggestionClick(suggestion: string) {
    setInput(suggestion)
    requestAnimationFrame(() => {
      const field = textareaRef.current
      if (!field) return
      field.style.height = 'auto'
      field.style.height = `${Math.min(field.scrollHeight, 160)}px`
      const cursor = suggestion.indexOf('[período]')
      field.focus()
      if (cursor >= 0) field.setSelectionRange(cursor, cursor + '[período]'.length)
    })
  }

  const hasMessages = messages.length > 0
  const { data: recentQuestions } = useSWR(hasMessages ? null : '/api/ai/recent-questions', fetchRecentQuestions, { revalidateOnFocus: true })
  const suggestedQuestions = recentQuestions && recentQuestions.length > 0 ? recentQuestions : FALLBACK_QUESTIONS

  const historyKey = clientId ? `/api/ai/conversations?includeArchived=1&clientId=${encodeURIComponent(clientId)}` : null
  const { data: historyData, mutate: refreshHistory } = useSWR(historyKey, fetchClientHistory, { revalidateOnFocus: true })
  useEffect(() => {
    if (status === 'ready') refreshHistory()
  }, [status, refreshHistory])

  const historyItems = (historyData ?? [])
    .filter((item) => item.lastMessagePreview || item.id === conversationId)
    .map((item) => ({
      id: item.id,
      updatedAt: item.updatedAt,
      label:
        item.id === conversationId && hasMessages
          ? messageText(messages.find((message) => message.role === 'user') ?? messages[0]).slice(0, 60) || 'Nueva conversación de análisis'
          : (item.lastMessagePreview ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Nueva conversación de análisis',
    }))
    .filter((item) => item.id !== conversationId || hasMessages)
  const historyGroups = Object.entries(
    historyItems.reduce<Record<string, typeof historyItems>>((groups, item) => {
      ;(groups[historySectionLabel(item.updatedAt)] ??= []).push(item)
      return groups
    }, {}),
  )

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-[#E6E6E1] bg-white p-3">
        <button
          type="button"
          onClick={onReset}
          disabled={!clientId || isResetting || !hasMessages}
          className="flex h-9 items-center justify-center gap-2 rounded-full border border-[#E6E6E1] bg-white text-sm font-medium text-[#141414] transition-colors hover:border-[#5B5FE8] hover:text-[#5B5FE8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isResetting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}+ Nuevo análisis
        </button>
        <nav aria-label="Análisis anteriores" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {historyGroups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[#9a9a9a]">Todavía no hay análisis</p>
          ) : (
            historyGroups.map(([section, items]) => (
              <section key={section} className="flex flex-col gap-0.5">
                <h3 className="px-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">{section}</h3>
                {items.map((item) => {
                  const isActive = item.id === conversationId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenConversation(item.id)}
                      disabled={isBusy || isResetting}
                      aria-current={isActive ? 'true' : undefined}
                      title={item.label}
                      className={cn(
                        'truncate rounded-md px-2 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed',
                        isActive ? 'bg-[#eeefff] text-[#5B5FE8]' : 'text-[#141414] hover:bg-[#f4f4f1]',
                      )}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </section>
            ))
          )}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        <div ref={scrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden bg-white p-4">
          {!hasMessages ? (
            <div className="m-auto flex max-w-md flex-col gap-4 text-center">
              <p className="text-sm text-[#9a9a9a]">
                Preguntale a Conexa por leads, inversión, conversiones, campañas o ventas de {clientName}. Indicá el período dentro de tu pregunta (por ejemplo, &quot;esta semana&quot; o &quot;el mes pasado&quot;); si no lo indicás, te lo va a pedir antes de responder.
              </p>
              <div className="flex flex-col gap-2 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">Últimas consultas del equipo</p>
                <div className="flex flex-col gap-2">
                  {suggestedQuestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={!clientId}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="group flex items-center gap-2 rounded-full border border-[#E6E6E1] bg-white px-3 py-1.5 text-left text-xs text-[#141414] transition-colors hover:border-[#5B5FE8] hover:bg-[#f4f4f1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>
                        {suggestion.includes('[período]') ? (
                          <>
                            {suggestion.split('[período]')[0]}
                            <span className="rounded bg-[#eeefff] px-1.5 py-0.5 font-semibold text-[#5B5FE8]">[período]</span>
                            {suggestion.split('[período]')[1]}
                          </>
                        ) : (
                          suggestion
                        )}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-[#9a9a9a] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <ChatBubble
                key={message.id}
                message={message}
                isLast={index === messages.length - 1}
                isStreaming={isStreamingAssistantMessage && index === messages.length - 1}
                onCreateReport={onCreateReport}
                reportCta={!isMonthlyReport && index === messages.length - 1 ? getReportCtaState(messages, index) : null}
                onEdit={!isBusy && message.role === 'user' ? () => handleEditMessage(message.id) : undefined}
                clientName={clientName}
                needsValidation={pendingValidationId === message.id}
                isReportConfirmed={!isBusy && reportConfirmation?.reportConfirmed === true && reportConfirmation.messageId === message.id}
                onConfirmReport={() => confirmReport(message.id)}
                onCorrectReport={startReportCorrection}
              />
            ))
          )}
          {showActivityPanel && (
            <div className="flex max-w-[80%] flex-col gap-1.5 self-start rounded-lg border border-[#E6E6E1] bg-white px-3 py-2 text-sm">
              {activitySteps.length === 0 ? (
                <span className="flex items-center gap-2 text-[#9a9a9a]">
                  <MoreHorizontal className="size-4 animate-pulse text-[#9a9a9a]" aria-hidden="true" />
                  Pensando…
                </span>
              ) : (
                activitySteps.map((step, index) => {
                  const isRunning = step.status === 'running'
                  const isError = step.status === 'error'
                  return (
                    <span
                      key={`${step.eventId}-${index}`}
                      className={cn(
                        'flex items-center gap-2',
                        isRunning ? 'text-[#141414]' : isError ? 'text-red-600' : 'text-[#9a9a9a]',
                      )}
                    >
                      {isRunning ? (
                        <MoreHorizontal className="size-4 shrink-0 animate-pulse text-[#5B5FE8]" aria-hidden="true" />
                      ) : (
                        <Check className={cn('size-4 shrink-0', isError ? 'text-red-600' : 'text-[#5B5FE8]')} aria-hidden="true" />
                      )}
                      {step.label}
                    </span>
                  )
                })
              )}
            </div>
          )}
        </div>
  {(error || requestError || attachmentError) && (
  <p className="border-t border-[#E6E6E1] px-4 py-2 text-sm text-red-600" role="alert">
  {attachmentError ?? requestError ?? error?.message ?? 'No se pudo procesar la conversación con Conexa.'}
  </p>
  )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-[#E6E6E1] p-3">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-1.5 rounded-full border border-[#E6E6E1] bg-[#f4f4f1] px-2 py-1 text-xs text-[#141414]"
                >
                  <FileText className="size-3.5 shrink-0 text-[#5B5FE8]" aria-hidden="true" />
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(index)}
                    aria-label={`Quitar ${file.name}`}
                    className="rounded-full text-[#9a9a9a] hover:text-[#141414]"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
              className="hidden"
              onChange={(event) => {
                handleFilesSelected(event.target.files)
                event.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!clientId || isBusy || attachments.length >= ATTACHMENT_MAX_COUNT}
              aria-label="Adjuntar archivo"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E6E6E1] bg-white text-[#141414] transition-colors hover:border-[#5B5FE8] hover:text-[#5B5FE8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Paperclip className="size-4" aria-hidden="true" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                const el = event.target
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={isCorrectingReport ? '¿Qué dato hay que corregir?' : 'Preguntale algo a Conexa...'}
              aria-label="Consulta para Conexa"
              disabled={!clientId || isBusy}
              className="min-h-9 flex-1 resize-none rounded-lg border border-[#E6E6E1] bg-white px-3 py-2 text-sm leading-6 text-[#141414] outline-none focus-visible:border-[#5B5FE8]"
            />
            {isBusy ? (
              <button
                type="button"
                onClick={() => stop()}
                aria-label="Detener respuesta"
                className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#141414] px-4 text-sm font-medium text-white"
              >
                <Square className="size-3.5 fill-current" aria-hidden="true" />
                Detener
              </button>
            ) : (
              <button
                type="submit"
                disabled={!clientId || (!input.trim() && attachments.length === 0)}
                aria-label="Enviar consulta"
                className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#5B5FE8] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" aria-hidden="true" />
                Enviar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function ChatBubble({
  message,
  isLast,
  isStreaming,
  onCreateReport,
  onEdit,
  reportCta,
  clientName,
  needsValidation,
  isReportConfirmed,
  onConfirmReport,
  onCorrectReport,
}: {
  message: UIMessage
  isLast: boolean
  isStreaming: boolean
  onCreateReport?: (content: string) => void
  onEdit?: () => void
  reportCta?: ReportCtaState | null
  clientName: string
  needsValidation: boolean
  isReportConfirmed: boolean
  onConfirmReport: () => void
  onCorrectReport: () => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)
  const [claudePromptOpen, setClaudePromptOpen] = useState(false)
  const isUser = message.role === 'user'
  const text = messageText(message)
  const fileParts = message.parts.filter((part) => part.type === 'file')
  const hasCharts = hasRenderChartPart(message)
  const claudePrompt = isReportConfirmed ? buildClaudeReportPrompt({ clientName, summary: text, charts: messageCharts(message) }) : ''

  async function copyClaudePrompt() {
    try {
      await navigator.clipboard.writeText(claudePrompt)
      toast('Prompt copiado')
    } catch {
      toast.error('No se pudo copiar el prompt')
    }
  }
  return (
    <div className={cn('group flex w-full min-w-0 flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'min-w-0 max-w-[80%] overflow-hidden break-words rounded-lg px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]',
          isUser ? 'bg-[#5B5FE8] text-white' : 'w-full max-w-[95%] border border-[#E6E6E1] bg-white text-[#141414]',
        )}
      >
        {fileParts.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {fileParts.map((part, index) => (
              <span
                key={`${part.filename ?? 'archivo'}-${index}`}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                  isUser ? 'bg-white/15 text-white' : 'bg-[#f4f4f1] text-[#141414]',
                )}
              >
                <FileText className="size-3 shrink-0" aria-hidden="true" />
                {part.filename ?? 'archivo adjunto'}
              </span>
            ))}
          </div>
        )}
        {isUser ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : isStreaming && !text && !hasCharts ? (
          <span className="text-[#9a9a9a]">Pensando…</span>
        ) : (
          message.parts.map((part, i) => {
            if (part.type === 'text') return part.text ? <MessageContent key={i} content={part.text} /> : null
            if (part.type === RENDER_CHART_PART) {
              if ('state' in part && part.state === 'output-available' && 'output' in part) {
                const spec = parseChartSpec(part.output)
                return spec ? <ChatChart key={i} spec={spec} /> : null
              }
              if ('state' in part && part.state === 'output-error') return null
              return <ChartSkeleton key={i} />
            }
            return null
          })
        )}
      </div>
      {needsValidation && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirmReport}
            className="h-9 rounded-full border border-[#5B5FE8] bg-white px-4 text-sm font-medium text-[#5B5FE8] transition-colors hover:bg-[#eeefff]"
          >
            Sí, es correcta
          </button>
          <button
            type="button"
            onClick={onCorrectReport}
            className="h-9 rounded-full border border-[#E6E6E1] bg-white px-4 text-sm font-medium text-[#141414] transition-colors hover:border-[#141414]"
          >
            Corregir datos
          </button>
        </div>
      )}
      {isReportConfirmed && (
        <>
          <button
            type="button"
            onClick={() => setClaudePromptOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#5B5FE8] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            Crear prompt para Claude
          </button>
          <Dialog open={claudePromptOpen} onOpenChange={setClaudePromptOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Prompt para Claude</DialogTitle>
                <DialogDescription>Armado solo con los datos que validaste para {clientName}.</DialogDescription>
              </DialogHeader>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[#E6E6E1] bg-[#f4f4f1] p-3 font-mono text-xs leading-5 text-[#141414]">
                {claudePrompt}
              </pre>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClaudePromptOpen(false)}
                  className="h-9 rounded-full border border-[#E6E6E1] bg-white px-4 text-sm font-medium text-[#141414] hover:border-[#141414]"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={copyClaudePrompt}
                  className="h-9 rounded-full bg-[#5B5FE8] px-4 text-sm font-medium text-white hover:opacity-90"
                >
                  Copiar prompt
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
      {isUser && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar mensaje"
          className="-mt-1 flex items-center gap-1 text-xs text-[#9a9a9a] opacity-0 transition-opacity hover:text-[#5B5FE8] group-hover:opacity-100"
        >
          <Pencil className="size-3" aria-hidden="true" />
          Editar
        </button>
      )}
      {!isUser && isLast && !isStreaming && text && reportCta?.confirmed && (
        <div className="flex flex-wrap gap-2">
          {onCreateReport && (
            <button type="button" onClick={() => onCreateReport(text)} className={CTA_CLASS}>
              Crear informe
            </button>
          )}
          {reportCta.prompt && (
            <button type="button" onClick={() => setPromptOpen(true)} className={CTA_CLASS}>
              Ver prompt
            </button>
          )}
          <a href={CLAUDE_DESIGN_URL} target="_blank" rel="noopener noreferrer" className={cn(CTA_CLASS, 'inline-flex items-center gap-1')}>
            Ir a Claude Design
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
      {reportCta?.prompt && (
        <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Prompt para Claude Design</DialogTitle>
              <DialogDescription>Copialo y pegalo en Claude Design para generar la plantilla.</DialogDescription>
            </DialogHeader>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-[#E6E6E1] bg-[#f4f4f1] p-3 font-mono text-xs leading-5 text-[#141414]">
              {reportCta.prompt}
            </pre>
            <div className="flex justify-end gap-2">
              <CopyButton
                getText={() => reportCta.prompt ?? ''}
                label="Copiar prompt"
                showLabel
                className={CTA_CLASS}
              />
              <a href={CLAUDE_DESIGN_URL} target="_blank" rel="noopener noreferrer" className={cn(CTA_CLASS, 'inline-flex items-center gap-1')}>
                Ir a Claude Design
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

const CTA_CLASS =
  'rounded-full border border-[#E6E6E1] bg-white px-3 py-1.5 text-xs font-medium text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]'
const CLAUDE_DESIGN_URL = 'https://claude.ai/design'
const REPORT_REQUEST = /\b(informe|reporte|report|prompt|claude design|cierre de mes)\b/i
const PROMPT_REQUEST = /\b(prompt|claude design)\b/i
const AFFIRMATIVE = /^\s*(s[ií]|dale|ok|okay|perfecto|de una|claro|arm[aá]lo|hacelo|pas[aá]melo|genial|bueno|confirmo|listo)\b/i
const CONFIRMATION_OFFER = /\b(confirm[aá]s|confirmar|confirmaci[oó]n|¿?quer[eé]s que (lo|te lo) (genere|prepare|muestre)|listo para (crear|generar)|puedo (crear|generar|mostrar) el informe)\b/i
const PROMPT_READY_OFFER = /\b(prompt|claude design)\b.*\b(listo|preparado|confirm[aá]|quer[eé]s)\b|\bquer[eé]s que te (muestre|pase|prepare) el prompt\b/i
const REPORT_READY_OFFER = /\b(informe|reporte)\b.*\b(listo|preparado|confirm[aá]|quer[eé]s)\b|\bquer[eé]s que (lo|te lo) (cree|genere|prepare)\b/i

function isConfirmedReportFlow(userText: string, previousAssistantText: string) {
  return AFFIRMATIVE.test(userText) && (CONFIRMATION_OFFER.test(previousAssistantText) || REPORT_READY_OFFER.test(previousAssistantText) || PROMPT_READY_OFFER.test(previousAssistantText))
} 

type ReportCtaState = { confirmed: boolean; prompt: string | null }

function getReportCtaState(messages: UIMessage[], index: number): ReportCtaState | null {
  const message = messages[index]
  if (message?.role !== 'assistant') return null
  const userText = messageText(messages[index - 1] ?? message)
  const previousAssistantText = index >= 2 ? messageText(messages[index - 2]) : ''
  // Un pedido directo todavía no habilita CTA: primero el agente debe pedir
  // la confirmación después de verificar y completar todos los datos.
  const confirmedOffer = isConfirmedReportFlow(userText, previousAssistantText)
  if (!confirmedOffer) return null

  const askedForPrompt = PROMPT_REQUEST.test(userText) || PROMPT_REQUEST.test(previousAssistantText)
  const promptSource = askedForPrompt
    ? [...messages.slice(0, index + 1)].reverse().map(messageText).find((text) => text.includes('```') || /#\s*(document_title|Informe|PERFORMANCE|Resumen)/i.test(text))
    : null
  return { confirmed: true, prompt: askedForPrompt ? extractPrompt(promptSource ?? messageText(message)) : null }
}

function extractPrompt(text: string) {
  const blocks = [...text.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((match) => match[1].trim())
  if (blocks.length > 0) return blocks.reduce((longest, block) => (block.length > longest.length ? block : longest))
  return text.trim() || null
}
