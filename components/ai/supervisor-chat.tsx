'use client'

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { FileUIPart, UIMessage } from 'ai'
import { mutate } from 'swr'
import { Bot, Check, ChevronRight, FileText, Loader2, Paperclip, RotateCcw, Send, User, X } from 'lucide-react'
import type { ActivityEvent } from '@/lib/ai/types'
import { ATTACHMENT_ACCEPT_ATTRIBUTE, ATTACHMENT_MAX_COUNT, ATTACHMENT_MAX_SIZE_BYTES, isAttachmentMimeTypeAllowed } from '@/lib/ai/attachments'
import { createClient } from '@/lib/supabase/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { MessageContent } from '@/components/chat/message-content'
import { AIAnalysisPanel } from './ai-analysis-panel'
import { CONVERSATIONS_SWR_KEY } from './conversations-sidebar'

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function messageHasVisibleContent(message: UIMessage) {
  return messageText(message).trim().length > 0
}

/** Muestra los archivos que el usuario adjuntó en ese mensaje, si tiene. */
function MessageFileChips({ message }: { message: UIMessage }) {
  const fileParts = message.parts.filter((part): part is FileUIPart => part.type === 'file')
  if (fileParts.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {fileParts.map((part, index) => (
        <a
          key={`${part.filename}-${index}`}
          href={part.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md bg-primary-foreground/15 px-2 py-1 text-xs text-primary-foreground hover:bg-primary-foreground/25"
        >
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="max-w-[160px] truncate">{part.filename || 'archivo adjunto'}</span>
        </a>
      ))}
    </div>
  )
}

/**
 * Se muestra en el lugar del mensaje del asistente mientras el Supervisor
 * todavía está generando la respuesta. En vez de ir pintando el markdown a
 * medio terminar (listas sin cerrar, negritas cortadas a la mitad), se
 * queda en este estado de "pensando" hasta que el turno completo esté listo
 * y recién ahí se reemplaza por el mensaje final ya formateado.
 */
function ThinkingBubble({ activity }: { activity: ActivityEvent | null }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground">
      <span className="flex gap-1" aria-hidden="true">
        <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary" />
      </span>
      <span>{activity?.label ?? 'Pensando…'}</span>
    </div>
  )
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
  scoreConfig?: { descriptions: { low: string; intermediate: string; high: string } }
  /** When true, the chat input is disabled and a placeholder message is shown instead of the conversation. */
  disabled?: boolean
  disabledMessage?: string
  title?: string
  description?: string
  emptyStateMessage?: string
}

type PersistedPerformanceAnalysis = {
  optimization_score?: number
  optimization_level?: string
  recommendations?: Array<{ id?: string; descripcion?: string; prioridad?: 'alta' | 'media' | 'baja'; evidence_ids?: string[] }>
  evidence?: Array<{ id?: string; source?: 'google' | 'meta' | 'crm' | 'user' | 'derived' | 'other' | null; account_id?: string | null; campaign_id?: string | null }>
  entity?: { platform?: 'google' | 'meta' | 'mixed'; account_ids?: string[] }
}

type PersistedMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  message_data?: { performance_analysis?: PersistedPerformanceAnalysis } | null
}

export function SupervisorChat(props: SupervisorChatProps) {
  const { clientId, disabled = false } = props
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<PersistedMessage[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  // Se incrementa al resetear el chat para forzar el refetch de abajo aunque
  // clientId no haya cambiado.
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!clientId || disabled) {
      setConversationId(null)
      setHistory([])
      return
    }

    let cancelled = false
    setIsLoadingHistory(true)
    // Cada cliente tiene exactamente un chat activo (garantizado por un
    // índice único en la base), así que alcanza con mandar el clientId: el
    // backend siempre resuelve/crea ese único chat, nunca uno nuevo.
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

    return () => { cancelled = true }
  }, [clientId, disabled, refreshToken])

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
      // Si falla el archivado, igual reintentamos el refetch: en el peor
      // caso el chat sigue mostrando la conversación anterior.
    }
    // El chat archivado deja de ser el "activo" del cliente, así que este
    // refetch trae/crea uno nuevo y vacío. La lista de "chats activos"
    // también se revalida para que desaparezca el preview del chat viejo.
    mutate(CONVERSATIONS_SWR_KEY)
    setRefreshToken((token) => token + 1)
  }

  if (isLoadingHistory && clientId && !disabled) {
    return <SupervisorChatShell {...props} loading />
  }

  return (
    <SupervisorChatSession
      key={conversationId ?? `new-${clientId ?? 'none'}`}
      {...props}
      conversationId={conversationId}
      initialMessages={history}
      onReset={handleReset}
      isResetting={isResetting}
    />
  )
}

type PendingAttachment = {
  localId: string
  filename: string
  mediaType: string
  status: 'uploading' | 'ready' | 'error'
  url?: string
  errorMessage?: string
}

/**
 * Sube un archivo al bucket público "chat-adjuntos" de Supabase Storage y
 * devuelve la URL pública. Cada archivo va en una carpeta por conversación
 * para poder limpiarlos más adelante si se quiere.
 */
async function uploadChatAttachment(file: File, folderKey: string): Promise<string> {
  const supabase = createClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `${folderKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
  const { error } = await supabase.storage.from('chat-adjuntos').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('chat-adjuntos').getPublicUrl(path)
  return data.publicUrl
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
  onReset,
  isResetting = false,
}: SupervisorChatProps & {
  conversationId: string | null
  initialMessages?: PersistedMessage[]
  onReset?: () => void
  isResetting?: boolean
}) {
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [currentActivity, setCurrentActivity] = useState<ActivityEvent | null>(null)
  // El Performance Analyst calcula el score/temperatura como parte del turno
  // del Supervisor, pero recién queda persistido en message_data cuando el
  // stream termina (onFinish del backend). Lo reflejamos acá apenas termina
  // cada turno, sin esperar a que el usuario recargue o cambie de cliente.
  const [latestAnalysis, setLatestAnalysis] = useState(
    initialMessages.findLast((message) => message.role === 'assistant')?.message_data?.performance_analysis ?? null,
  )
  const scrollContainerRef = useRef<HTMLDivElement>(null)
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
    onFinish: () => {
      // Revalida el listado de "chats activos" para que el sidebar refleje
      // el nuevo último mensaje y suba esta conversación al tope.
      mutate(CONVERSATIONS_SWR_KEY)
      // El score recién quedó persistido en el backend en este mismo
      // instante: lo traemos para actualizar el panel de análisis sin
      // esperar a un reload.
      if (clientId) {
        fetch('/api/ai/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clientId }),
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((data: { messages: PersistedMessage[] } | null) => {
            const analysis = data?.messages.findLast((message) => message.role === 'assistant')?.message_data?.performance_analysis
            if (analysis) setLatestAnalysis(analysis)
          })
          .catch(() => {})
      }
    },
  })
  const isBusy = status === 'submitted' || status === 'streaming'
  const lastMessage = messages.at(-1)
  // Mientras el turno del asistente sigue en curso, el mensaje se muestra
  // como "pensando" en vez de ir revelando el markdown a medio terminar.
  const isStreamingAssistantMessage = isBusy && lastMessage?.role === 'assistant'
  const isInputDisabled = disabled || isBusy || isResetting

  // Mantiene la conversación con scroll propio: cada mensaje nuevo o cambio
  // de estado hace autoscroll al final, en vez de forzar scroll de toda la
  // página para poder ver el historial completo.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages, isBusy, currentActivity])

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setAttachmentError(null)

    if (pendingFiles.length + files.length > ATTACHMENT_MAX_COUNT) {
      setAttachmentError(`Podés adjuntar hasta ${ATTACHMENT_MAX_COUNT} archivos por mensaje.`)
      return
    }

    const folderKey = conversationId ?? clientId ?? 'sin-cliente'
    const accepted: PendingAttachment[] = []
    for (const file of files) {
      if (!isAttachmentMimeTypeAllowed(file.type, file.name)) {
        setAttachmentError(`"${file.name}" no es un formato soportado. Usá imagen, PDF, CSV, TXT o Excel.`)
        continue
      }
      if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
        setAttachmentError(`"${file.name}" supera el tamaño máximo de ${Math.round(ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB.`)
        continue
      }
      accepted.push({ localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, filename: file.name, mediaType: file.type || 'application/octet-stream', status: 'uploading' })
      const localId = accepted.at(-1)!.localId
      setPendingFiles((prev) => [...prev, accepted.at(-1)!])
      uploadChatAttachment(file, folderKey)
        .then((url) => {
          setPendingFiles((prev) => prev.map((item) => (item.localId === localId ? { ...item, status: 'ready', url } : item)))
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'No se pudo subir el archivo.'
          setPendingFiles((prev) => prev.map((item) => (item.localId === localId ? { ...item, status: 'error', errorMessage: message } : item)))
        })
    }
  }

  function handleRemoveFile(localId: string) {
    setPendingFiles((prev) => prev.filter((item) => item.localId !== localId))
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía el mensaje; Shift+Enter agrega un salto de línea. No
    // enviamos mientras el usuario está componiendo texto con un IME
    // (chino/japonés/coreano) ni en el evento final poco confiable de
    // Safari Desktop (keyCode 229), para no cortar la composición.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = input.trim()
    const readyFiles = pendingFiles.filter((file) => file.status === 'ready' && file.url)
    const isUploadingFiles = pendingFiles.some((file) => file.status === 'uploading')
    if ((!query && readyFiles.length === 0) || isInputDisabled || isUploadingFiles) return

    const fileParts: FileUIPart[] = readyFiles.map((file) => ({ type: 'file', mediaType: file.mediaType, filename: file.filename, url: file.url! }))
    const text = query || 'Adjunto archivo(s) para análisis.'
    setInput('')
    setPendingFiles([])
    setAttachmentError(null)
    // El alto se manejaba a mano en el DOM (onChange), así que hay que
    // resetearlo explícitamente al vaciar el textarea; si no, queda con la
    // altura expandida del mensaje anterior.
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage({ text, files: fileParts }, {
      body: {
        context: clientId
          ? { clientId, ...(conversationId ? { conversationId } : {}), ...(scoreConfig ? { scoreConfig } : {}) }
          : {},
      },
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {!disabled && onReset && messages.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isBusy || isResetting}>
                {isResetting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                Resetear chat
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Resetear esta conversación?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se va a archivar el historial actual y vas a empezar un chat nuevo y vacío con este cliente. El historial anterior no se borra, pero deja de mostrarse acá.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onReset}>Resetear chat</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-0">
        <div className="flex flex-col lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div ref={scrollContainerRef} className="flex h-[65vh] min-h-[420px] max-h-[640px] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-4" aria-live="polite">
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
            messages.map((message, index) => {
              const isThisMessageStreaming = isStreamingAssistantMessage && index === messages.length - 1
              return (
                <div
                  key={message.id}
                  aria-label={isThisMessageStreaming ? 'El Supervisor está pensando la respuesta' : messageHasVisibleContent(message) ? undefined : message.role === 'assistant' ? 'El Supervisor está procesando la respuesta' : 'Mensaje sin contenido'}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role !== 'user' && (
                    <Bot className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                  )}
                  <div
                    className={`min-w-0 rounded-lg px-3 py-2 text-sm leading-6 ${
                      message.role === 'user' ? 'max-w-[80%] bg-primary text-primary-foreground' : 'w-full max-w-[95%] bg-card'
                    }`}
                  >
                    {message.role === 'user' && (
                      <MessageFileChips message={message} />
                    )}
                    {isThisMessageStreaming ? (
                      <ThinkingBubble activity={currentActivity} />
                    ) : messageHasVisibleContent(message) ? message.role === 'assistant' ? (
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
              )
            })
          )}
          {!disabled && isBusy && !isStreamingAssistantMessage && <MultiagentActivityStatus activity={currentActivity ?? { eventId: 'fallback', agentSlug: 'supervisor', status: 'running', label: 'Procesando consulta…', timestamp: new Date().toISOString() }} />}
          {!disabled && error && (
            <p className="text-sm text-destructive" role="alert">
              {error.message || 'No se pudo procesar la conversación del Supervisor.'}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {attachmentError && (
            <p className="text-xs text-destructive" role="alert">{attachmentError}</p>
          )}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingFiles.map((file) => (
                <span
                  key={file.localId}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    file.status === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-card text-foreground'
                  }`}
                >
                  {file.status === 'uploading' ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="max-w-[140px] truncate" title={file.errorMessage ?? file.filename}>{file.filename}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.localId)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Quitar ${file.filename}`}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form className="flex items-end gap-2" onSubmit={handleSubmit}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
              onChange={handleFileSelect}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              disabled={isInputDisabled || pendingFiles.length >= ATTACHMENT_MAX_COUNT}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo (imagen, PDF, CSV, TXT o Excel)"
            >
              <Paperclip aria-hidden="true" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                const el = event.target
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`
              }}
              onKeyDown={handleTextareaKeyDown}
              placeholder={disabled ? disabledMessage : 'Escribí una consulta para el Supervisor… (Enter para enviar, Shift+Enter para salto de línea)'}
              aria-label="Consulta para el Supervisor"
              disabled={isInputDisabled}
              rows={1}
              className="min-h-9 flex-1 resize-none py-2 leading-6"
            />
            <Button
              type="submit"
              className="shrink-0"
              disabled={isInputDisabled || (!input.trim() && pendingFiles.length === 0) || pendingFiles.some((file) => file.status === 'uploading')}
              aria-label="Enviar consulta"
            >
              <Send data-icon="inline-start" />
              Enviar
            </Button>
          </form>
        </div>
          </div>
          <AIAnalysisPanel content={lastMessage?.role === 'assistant' ? messageText(lastMessage) : ''} analysis={latestAnalysis} />
        </div>
      </CardContent>
    </Card>
  )
}
