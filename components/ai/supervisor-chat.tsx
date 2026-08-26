'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { Bot, Check, ChevronRight, Loader2, Send, User, X } from 'lucide-react'
import type { ActivityEvent } from '@/lib/ai/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MessageContent } from '@/components/chat/message-content'

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function messageHasVisibleContent(message: UIMessage) {
  return messageText(message).trim().length > 0
}

function MultiagentActivityStatus({ activity }: { activity: ActivityEvent | null }) {
  if (!activity) return null
  const Icon = activity.status === 'running' ? Loader2 : activity.status === 'completed' ? Check : X
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground" aria-live="polite">
      <Icon className={`size-3.5 ${activity.status === 'running' ? 'animate-spin text-primary' : activity.status === 'error' ? 'text-destructive' : 'text-emerald-500'}`} aria-hidden="true" />
      <span>{activity.label}</span>
    </div>
  )
}



interface SupervisorChatProps {
  clientId: string | null
  scoreConfig?: { coldMax: number; warmMax: number }
  /** When true, the chat input is disabled and a placeholder message is shown instead of the conversation. */
  disabled?: boolean
  disabledMessage?: string
  title?: string
  description?: string
  emptyStateMessage?: string
}

type PersistedMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export function SupervisorChat(props: SupervisorChatProps) {
  const { clientId, disabled = false } = props
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<PersistedMessage[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  useEffect(() => {
    if (!clientId || disabled) {
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
        if (!cancelled) setIsLoadingHistory(false)
      })

    return () => { cancelled = true }
  }, [clientId, disabled])

  if (isLoadingHistory && clientId && !disabled) {
    return <SupervisorChatShell {...props} loading />
  }

  return (
    <SupervisorChatSession
      key={conversationId ?? `new-${clientId ?? 'none'}`}
      {...props}
      conversationId={conversationId}
      initialMessages={history}
    />
  )
}

function SupervisorChatShell({ ...props }: SupervisorChatProps & { loading?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{props.title ?? 'Conversación de prueba'}</CardTitle>
        <CardDescription>{props.description ?? 'El Supervisor decide qué contexto y herramientas necesita cada consulta.'}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground" aria-live="polite">
          Cargando conversación…
        </div>
      </CardContent>
    </Card>
  )
}

function SupervisorChatSession({
  clientId,
  scoreConfig,
  disabled = false,
  disabledMessage = 'Seleccioná un cliente para comenzar el análisis.',
  title = 'Conversación de prueba',
  description = 'El Supervisor decide qué contexto y herramientas necesita cada consulta.',
  emptyStateMessage = 'Probá con una pregunta sobre cuentas, Meta Ads, Google Ads o insights previos.',
  conversationId,
  initialMessages = [],
}: SupervisorChatProps & { conversationId: string | null; initialMessages?: PersistedMessage[] }) {
  const [input, setInput] = useState('')
  const [currentActivity, setCurrentActivity] = useState<ActivityEvent | null>(null)
  const persistedMessages: UIMessage[] = initialMessages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
  }))
  const { messages, sendMessage, status, error } = useChat({
    messages: persistedMessages,
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: {
        context: clientId
          ? { clientId, ...(conversationId ? { conversationId } : {}), ...(scoreConfig ? { scoreConfig } : {}) }
          : {},
      },
    }),
    onData: (dataPart) => {
      if (dataPart.type === 'data-activity') {
        setCurrentActivity(dataPart.data as ActivityEvent)
      }
    },
  })
  const isBusy = status === 'submitted' || status === 'streaming'
  const lastMessage = messages.at(-1)
  const hasStreamingText = isBusy && lastMessage?.role === 'assistant' && messageText(lastMessage).length > 0
  const isInputDisabled = disabled || isBusy

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = input.trim()
    if (!query || isInputDisabled) return
    setInput('')
    await sendMessage({ text: query })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex min-h-[360px] flex-col gap-3 rounded-lg border bg-muted/30 p-4" aria-live="polite">
          {disabled ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center text-muted-foreground">
              <Bot className="size-8" aria-hidden="true" />
              <p>{disabledMessage}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="m-auto flex w-full max-w-2xl flex-col gap-6 py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-foreground">¿En qué podemos ayudarte?</p>
                  <p className="text-sm leading-6 text-muted-foreground">Este multiagente analiza el rendimiento comercial y de paid media del cliente seleccionado. Puede consultar Google Ads y Meta Ads, comparar períodos, detectar oportunidades y convertir los datos en recomendaciones accionables.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Podés empezar preguntando</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    '¿Cómo fue el rendimiento de mis campañas en los últimos 90 días?',
                    '¿Qué campañas debería optimizar primero y por qué?',
                    'Compará Meta Ads y Google Ads y señalá las diferencias.',
                    '¿Qué acciones concretas recomendás para mejorar las conversiones?',
                  ].map((suggestion) => (
                    <button key={suggestion} type="button" className="group flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent" onClick={() => setInput(suggestion)}>
                      <span>{suggestion}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">{emptyStateMessage}</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                aria-label={messageHasVisibleContent(message) ? undefined : message.role === 'assistant' ? 'El Supervisor está procesando la respuesta' : 'Mensaje sin contenido'}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role !== 'user' && (
                  <Bot className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6 ${
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card'
                  }`}
                >
                  {messageHasVisibleContent(message) ? message.role === 'assistant' ? (
                    <MessageContent content={messageText(message)} />
                  ) : (
                    <span className="whitespace-pre-wrap">{messageText(message)}</span>
                  ) : message.role === 'assistant' ? (
                    <span className="text-muted-foreground">Preparando respuesta…</span>
                  ) : null}
                </div>
                {message.role === 'user' && (
                  <User className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
            ))
          )}
          {!disabled && isBusy && !hasStreamingText && <MultiagentActivityStatus activity={currentActivity ?? { eventId: 'fallback', agentSlug: 'supervisor', status: 'running', label: 'Procesando consulta…', timestamp: new Date().toISOString() }} />}
          {!disabled && error && (
            <p className="text-sm text-destructive" role="alert">
              {error.message || 'No se pudo procesar la conversación del Supervisor.'}
            </p>
          )}
        </div>

        <form className="flex gap-2" onSubmit={handleSubmit}>
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={disabled ? disabledMessage : 'Escribí una consulta para el Supervisor…'}
            aria-label="Consulta para el Supervisor"
            disabled={isInputDisabled}
          />
          <Button type="submit" disabled={isInputDisabled || !input.trim()} aria-label="Enviar consulta">
            <Send data-icon="inline-start" />
            Enviar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
