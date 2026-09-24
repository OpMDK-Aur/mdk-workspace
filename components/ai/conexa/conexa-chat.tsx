'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { ChevronRight, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MessageContent } from '@/components/chat/message-content'
import type { ActivityEvent } from '@/lib/ai/types'

const SUGGESTED_QUESTIONS = [
  '¿Cuántos leads se convirtieron en venta en [período]?',
  'Dame un desglose por campaña de la cantidad de leads que ingresaron al CRM y cuántas ventas tuve por campaña en [período].',
  '¿Cuál fue la inversión en Meta Ads y Google Ads durante [período]?',
  '¿Qué campañas tuvieron el mejor y el peor desempeño en [período]?',
]

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
      body: JSON.stringify({ clientId }),
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

  async function handleReset() {
    if (!conversationId || isResetting) return
    setIsResetting(true)
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
  isResetting,
}: ConexaChatProps & {
  conversationId: string | null
  initialMessages: PersistedMessage[]
  onReset: () => void
  isResetting: boolean
}) {
  const [input, setInput] = useState('')
  const [currentActivity, setCurrentActivity] = useState<ActivityEvent | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  const { messages, sendMessage, status, error } = useChat({
    messages: persistedMessages,
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { context: buildContext() },
    }),
    onData: (dataPart) => {
      if (dataPart.type === 'data-activity') setCurrentActivity(dataPart.data as ActivityEvent)
    },
    onError: (streamError) => {
      const message = streamError instanceof Error ? streamError.message : 'No se pudo completar la respuesta.'
      setCurrentActivity({ eventId: 'client-error', agentSlug: 'supervisor', status: 'error', label: message, timestamp: new Date().toISOString() })
    },
  })

  const isBusy = status === 'submitted' || status === 'streaming'
  const lastMessage = messages.at(-1)
  const isStreamingAssistantMessage = isBusy && lastMessage?.role === 'assistant'

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages.length, isBusy, currentActivity])

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
    if (!text || isBusy || !clientId) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setCurrentActivity(null)
    await sendMessage({ text }, { body: { context: buildContext() } })
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
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {!hasMessages ? (
            <p className="px-2 py-6 text-center text-sm text-[#9a9a9a]">Todavía no hay análisis</p>
          ) : (
            <section className="flex flex-col gap-0.5">
              <h3 className="px-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">Hoy</h3>
              <div className="truncate rounded-md bg-[#eeefff] px-2 py-2 text-left text-sm text-[#5B5FE8]">
                {messageText(messages[0]).slice(0, 60) || 'Nueva conversación de análisis'}
              </div>
            </section>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-white p-4">
          {!hasMessages ? (
            <div className="m-auto flex max-w-md flex-col gap-4 text-center">
              <p className="text-sm text-[#9a9a9a]">
                Preguntale a Conexa por leads, inversión, conversiones, campañas o ventas de {clientName}. Indicá el período dentro de tu pregunta (por ejemplo, &quot;esta semana&quot; o &quot;el mes pasado&quot;); si no lo indicás, te lo va a pedir antes de responder.
              </p>
              <div className="flex flex-col gap-2 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">Podés empezar preguntando</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTED_QUESTIONS.map((suggestion) => (
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
              />
            ))
          )}
          {isBusy && !isStreamingAssistantMessage && (
            <div className="flex items-center gap-2 self-start rounded-lg border border-[#E6E6E1] bg-white px-3 py-2 text-sm text-[#9a9a9a]">
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-1.5 animate-bounce rounded-full bg-[#5B5FE8] [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#5B5FE8] [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-[#5B5FE8]" />
              </span>
              {currentActivity?.label ?? 'Pensando…'}
            </div>
          )}
        </div>
        {error && (
          <p className="border-t border-[#E6E6E1] px-4 py-2 text-sm text-red-600" role="alert">
            {error.message || 'No se pudo procesar la conversación con Conexa.'}
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[#E6E6E1] p-3">
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
            placeholder="Preguntale algo a Conexa..."
            aria-label="Consulta para Conexa"
            disabled={!clientId || isBusy}
            className="min-h-9 flex-1 resize-none rounded-lg border border-[#E6E6E1] bg-white px-3 py-2 text-sm leading-6 text-[#141414] outline-none focus-visible:border-[#5B5FE8]"
          />
          <button
            type="submit"
            disabled={!clientId || isBusy || !input.trim()}
            aria-label="Enviar consulta"
            className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-[#5B5FE8] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden="true" />
            Enviar
          </button>
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
}: {
  message: UIMessage
  isLast: boolean
  isStreaming: boolean
  onCreateReport?: (content: string) => void
}) {
  const isUser = message.role === 'user'
  const text = messageText(message)
  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6',
          isUser ? 'bg-[#5B5FE8] text-white' : 'w-full max-w-[95%] border border-[#E6E6E1] bg-white text-[#141414]',
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : isStreaming && !text ? (
          <span className="text-[#9a9a9a]">Pensando…</span>
        ) : (
          <MessageContent content={text} />
        )}
      </div>
      {!isUser && isLast && !isStreaming && text && onCreateReport && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onCreateReport(text)}
            className="rounded-full border border-[#E6E6E1] bg-white px-3 py-1.5 text-xs font-medium text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]"
          >
            Crear informe
          </button>
          <button
            type="button"
            onClick={() => onCreateReport(text)}
            className="rounded-full border border-[#E6E6E1] bg-white px-3 py-1.5 text-xs font-medium text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]"
          >
            Generar diagnóstico
          </button>
        </div>
      )}
    </div>
  )
}
