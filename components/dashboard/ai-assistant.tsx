'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { cn } from '@/lib/utils'
import type { Client } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  MessageCircle, 
  X, 
  Send, 
  Sparkles,
  ChevronRight,
} from 'lucide-react'

interface AIAssistantProps {
  isOpen: boolean
  onToggle: () => void
  selectedClientId: string | null
  clients: Client[]
}

const suggestedQuestions = [
  '¿Por qué cayó el ROAS de Mundos E?',
  'Generá alerta para Delta Group',
  'Comparar este mes vs julio',
]

function getMessageText(parts: Array<{ type: string; text?: string }> | undefined): string {
  if (!parts || !Array.isArray(parts)) return ''
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
}

export function AIAssistant({ isOpen, onToggle, selectedClientId, clients }: AIAssistantProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const selectedClient = clients.find(c => c.id === selectedClientId)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ 
      api: '/api/chat',
    }),
    initialMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        parts: [{
          type: 'text',
          text: 'Hola! Soy el Asistente MDK. Estoy listo para ayudarte a analizar campañas, revisar KPIs y generar reportes. ¿En qué te puedo ayudar?',
        }],
      },
    ],
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (message?: string) => {
    const text = message || input
    if (!text.trim() || isLoading) return

    // Pass clientId dynamically per-message to avoid stale closure
    sendMessage({ text }, { body: { clientId: selectedClientId } })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 bg-primary text-primary-foreground p-4 rounded-full shadow-lg hover:scale-105 transition-transform z-50"
        aria-label="Abrir asistente"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    )
  }

  return (
    <aside className="w-80 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <h2 className="font-semibold">Asistente MDK</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Context */}
      <div className="px-4 py-2 border-b border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Contexto activo:{' '}
          <span className="text-primary font-medium">
            {selectedClient?.business_name || 'Paid Media'} · KPIs abril
          </span>
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => {
            const text = getMessageText(message.parts)
            
            return (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  {message.role === 'assistant' && (
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Asistente
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{text}</p>
                  
                  {/* Render tool results */}
                  {message.parts?.map((part, idx) => {
                    if (part.type === 'tool-invocation') {
                      const toolPart = part as { type: 'tool-invocation'; toolInvocation: { toolName: string; state: string; result?: unknown } }
                      if (toolPart.toolInvocation.state === 'output-available') {
                        return (
                          <div key={idx} className="mt-2 p-2 bg-background/50 rounded text-xs border border-border">
                            <p className="font-medium text-primary mb-1">
                              {toolPart.toolInvocation.toolName === 'analyzeClient' && 'Análisis completado'}
                              {toolPart.toolInvocation.toolName === 'generateReport' && 'Reporte generado'}
                              {toolPart.toolInvocation.toolName === 'createAlert' && 'Alerta creada'}
                            </p>
                            <pre className="text-muted-foreground overflow-x-auto">
                              {JSON.stringify(toolPart.toolInvocation.result, null, 2)}
                            </pre>
                          </div>
                        )
                      }
                    }
                    return null
                  })}
                </div>
              </div>
            )
          })}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary animate-spin" />
                  <span className="text-muted-foreground">Pensando...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Suggested questions */}
      <div className="px-4 py-2 border-t border-border">
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((question, i) => (
            <button
              key={i}
              onClick={() => handleSend(question)}
              disabled={isLoading}
              className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronRight className="h-3 w-3" />
              <span className="truncate max-w-[150px]">{question}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pedile algo al asistente..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button 
            onClick={() => handleSend()} 
            size="icon" 
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
