'use client'

import { FormEvent, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { Bot, Send, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

interface SupervisorChatProps {
  clientId: string | null
  /** When true, the chat input is disabled and a placeholder message is shown instead of the conversation. */
  disabled?: boolean
  disabledMessage?: string
  title?: string
  description?: string
  emptyStateMessage?: string
}

export function SupervisorChat({
  clientId,
  disabled = false,
  disabledMessage = 'Seleccioná un cliente para comenzar el análisis.',
  title = 'Conversación de prueba',
  description = 'El Supervisor decide qué contexto y herramientas necesita cada consulta.',
  emptyStateMessage = 'Probá con una pregunta sobre cuentas, Meta Ads, Google Ads o insights previos.',
}: SupervisorChatProps) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { context: clientId ? { clientId } : {} },
    }),
  })
  const isBusy = status === 'submitted' || status === 'streaming'
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
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center text-muted-foreground">
              <Bot className="size-8" aria-hidden="true" />
              <p>{emptyStateMessage}</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
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
                  {messageText(message)}
                </div>
                {message.role === 'user' && (
                  <User className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
            ))
          )}
          {!disabled && isBusy && <p className="text-xs text-muted-foreground">El Supervisor está procesando…</p>}
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
