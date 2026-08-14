'use client'

import { FormEvent, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { Bot, Send, Sparkles, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export function SupervisorPlayground({ clientId }: { clientId: string | null }) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { context: clientId ? { clientId } : {} },
    }),
  })
  const isBusy = status === 'submitted' || status === 'streaming'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = input.trim()
    if (!query || isBusy) return
    setInput('')
    await sendMessage({ text: query })
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2 border-b pb-6">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
            <span className="font-mono text-xs uppercase tracking-[0.18em]">AI workspace</span>
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Supervisor Agent</h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Punto de entrada aislado para validar el enrutamiento de consultas, herramientas y respuesta streaming.
          </p>
        </header>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Conversación de prueba</CardTitle>
            <CardDescription>El Supervisor decide qué contexto y herramientas necesita cada consulta.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex min-h-[360px] flex-col gap-3 rounded-lg border bg-muted/30 p-4" aria-live="polite">
              {messages.length === 0 ? (
                <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center text-muted-foreground">
                  <Bot className="size-8" aria-hidden="true" />
                  <p>Probá con una pregunta sobre cuentas, Meta Ads, Google Ads o insights previos.</p>
                </div>
              ) : messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role !== 'user' && <Bot className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />}
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                    {messageText(message)}
                  </div>
                  {message.role === 'user' && <User className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                </div>
              ))}
              {isBusy && <p className="text-xs text-muted-foreground">El Supervisor está procesando…</p>}
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error.message || 'No se pudo procesar la conversación del Supervisor.'}
                </p>
              )}
            </div>

            <form className="flex gap-2" onSubmit={handleSubmit}>
              <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escribí una consulta para el Supervisor…" aria-label="Consulta para el Supervisor" disabled={isBusy} />
              <Button type="submit" disabled={isBusy || !input.trim()} aria-label="Enviar consulta">
                <Send data-icon="inline-start" />
                Enviar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
