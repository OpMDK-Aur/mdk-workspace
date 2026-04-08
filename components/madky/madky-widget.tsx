'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, UIMessage } from 'ai'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sparkles,
  X,
  Send,
  Maximize2,
  Minimize2,
  Presentation,
  MessageSquare,
  Loader2,
  Bot,
  User,
  ChevronLeft,
  ChevronRight,
  Building2,
  Search,
  Database,
  BarChart3,
  Users,
} from 'lucide-react'
import type { Client } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MadkyWidgetProps {
  selectedClient?: Client | null
  allClients?: Client[]
}

type ViewMode = 'chat' | 'presentation'

interface Slide {
  title: string
  content: string
}

// Tool name to human-readable label
const TOOL_LABELS: Record<string, { label: string; icon: 'search' | 'database' | 'chart' | 'users' }> = {
  getClientInfo: { label: 'Obteniendo info del cliente', icon: 'database' },
  getMetaAdsMetrics: { label: 'Consultando Meta Ads', icon: 'chart' },
  getGoogleAdsMetrics: { label: 'Consultando Google Ads', icon: 'chart' },
  getCRMOpportunities: { label: 'Consultando oportunidades', icon: 'users' },
  getCRMContacts: { label: 'Consultando contactos', icon: 'users' },
}

// Helper to extract text from UIMessage parts
function getMessageText(message: UIMessage): string {
  if (!message.parts || !Array.isArray(message.parts)) return ''
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

// Helper to extract tool invocations from message parts
function getToolInvocations(message: UIMessage): Array<{ toolName: string; state: string }> {
  if (!message.parts || !Array.isArray(message.parts)) return []
  return message.parts
    .filter((p): p is { type: 'tool-invocation'; toolInvocation: { toolName: string; state: string } } => 
      p.type === 'tool-invocation'
    )
    .map((p) => ({
      toolName: p.toolInvocation.toolName,
      state: p.toolInvocation.state,
    }))
}

// Parse presentation from message content
function parsePresentation(content: string): Slide[] | null {
  const startMarker = '<!-- PRESENTATION_START -->'
  const endMarker = '<!-- PRESENTATION_END -->'
  
  if (!content.includes(startMarker)) return null
  
  const startIdx = content.indexOf(startMarker) + startMarker.length
  const endIdx = content.includes(endMarker) ? content.indexOf(endMarker) : content.length
  const presentationContent = content.slice(startIdx, endIdx).trim()
  
  // Split by slide markers
  const slideRegex = /<!-- SLIDE: (.+?) -->/g
  const slides: Slide[] = []
  let lastIndex = 0
  let match
  
  while ((match = slideRegex.exec(presentationContent)) !== null) {
    if (slides.length > 0) {
      slides[slides.length - 1].content = presentationContent.slice(lastIndex, match.index).trim()
    }
    slides.push({ title: match[1], content: '' })
    lastIndex = match.index + match[0].length
  }
  
  if (slides.length > 0) {
    slides[slides.length - 1].content = presentationContent.slice(lastIndex).trim()
  }
  
  // If no slide markers, treat entire content as one slide
  if (slides.length === 0 && presentationContent) {
    slides.push({ title: 'Presentación', content: presentationContent })
  }
  
  return slides.length > 0 ? slides : null
}

export function MadkyWidget({ selectedClient, allClients = [] }: MadkyWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [input, setInput] = useState('')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [presentationSlides, setPresentationSlides] = useState<Slide[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  
  // Internal client selection - syncs with dashboard selection
  const [internalClientId, setInternalClientId] = useState<string | null>(
    () => selectedClient?.id ?? (allClients.length > 0 ? allClients[0].id : null)
  )
  
  // Update internalClientId when allClients loads and we don't have a selection yet
  useEffect(() => {
    if (!internalClientId && allClients.length > 0) {
      setInternalClientId(allClients[0].id)
    }
  }, [allClients, internalClientId])
  
  // Get the current client object
  const currentClient = internalClientId 
    ? allClients.find(c => c.id === internalClientId) ?? null
    : null
  
  // Use a ref to always have the latest client context for the transport
  const clientContextRef = useRef<{ 
    clientId: string
    clientName: string
    plan?: string | null
    status?: string | null
    metaAdsId?: string | null
    googleAdsId?: string | null
  } | null>(null)
  
  // Keep clientContextRef in sync with currentClient
  useEffect(() => {
    clientContextRef.current = currentClient ? {
      clientId: currentClient.id,
      clientName: currentClient.business_name,
      plan: currentClient.plan,
      status: currentClient.status,
      metaAdsId: currentClient.meta_ads_id,
      googleAdsId: currentClient.google_ads_id,
    } : null
  }, [currentClient])
  
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ 
      api: '/api/madky/chat',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          messages,
          clientContext: clientContextRef.current,
        },
      }),
    }),
  })

  // Sync with selectedClient when it changes externally from dashboard
  const prevSelectedClientId = useRef<string | null>(selectedClient?.id ?? null)
  useEffect(() => {
    // Only sync if the dashboard selection actually changed (not on initial render)
    if (selectedClient?.id && selectedClient.id !== prevSelectedClientId.current) {
      prevSelectedClientId.current = selectedClient.id
      setInternalClientId(selectedClient.id)
      // Clear conversation when client changes from dashboard
      setMessages([])
    }
  }, [selectedClient?.id, setMessages])
  
  // Handle client change from the widget selector
  const handleClientChange = (newClientId: string) => {
    if (newClientId !== internalClientId) {
      setInternalClientId(newClientId)
      setMessages([]) // Clear conversation for new client
      setPresentationSlides(null)
      setViewMode('chat')
    }
  }

  const isLoading = status === 'streaming' || status === 'submitted'

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Check for presentation in last assistant message
  useEffect(() => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')
    if (lastAssistantMessage) {
      const text = getMessageText(lastAssistantMessage)
      const slides = parsePresentation(text)
      if (slides) {
        setPresentationSlides(slides)
        setCurrentSlide(0)
      }
    }
  }, [messages])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    
    // Client context is automatically included via prepareSendMessagesRequest
    sendMessage({ text: input })
    setInput('')
  }, [input, isLoading, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }, [handleSubmit])

  const clearChat = () => {
    setMessages([])
    setPresentationSlides(null)
    setViewMode('chat')
  }

  // Widget button (closed state)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-[9999]',
          'flex items-center gap-2.5 px-4 py-3',
          'bg-gradient-to-r from-violet-600 to-purple-600',
          'hover:from-violet-500 hover:to-purple-500',
          'text-white font-medium text-sm',
          'rounded-full shadow-lg shadow-violet-500/25',
          'transition-all duration-300 ease-out',
          'hover:scale-105 hover:shadow-xl hover:shadow-violet-500/30',
          'group'
        )}
      >
        <Sparkles className="h-5 w-5 transition-transform group-hover:rotate-12" />
        <span>Madky</span>
      </button>
    )
  }

  // Chat panel (open state)
  return (
    <div
      className={cn(
        'fixed z-[9999] flex flex-col overflow-hidden',
        'bg-card border border-border/60 rounded-2xl shadow-2xl',
        'transition-all duration-300 ease-out',
        isExpanded
          ? 'bottom-4 right-4 w-[500px] h-[calc(100vh-100px)] max-h-[700px]'
          : 'bottom-4 right-4 w-[360px] h-[480px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-foreground text-sm">Madky</h3>
            {/* Client selector */}
            <Select 
              value={internalClientId ?? ''} 
              onValueChange={(val) => val && handleClientChange(val)}
            >
              <SelectTrigger className="h-7 w-[180px] border border-border bg-background px-2 text-xs hover:bg-muted focus:ring-1 focus:ring-violet-500/50 rounded-md">
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="h-3 w-3 text-violet-500 shrink-0" />
                  <SelectValue placeholder={allClients.length > 0 ? "Seleccionar cliente" : "Cargando..."} />
                </div>
              </SelectTrigger>
              <SelectContent className="max-h-[300px] z-[10000]">
                {allClients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{client.business_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          {presentationSlides && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode(viewMode === 'chat' ? 'presentation' : 'chat')}
              title={viewMode === 'chat' ? 'Ver presentación' : 'Volver al chat'}
            >
              {viewMode === 'chat' ? (
                <Presentation className="h-4 w-4" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:text-destructive"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'chat' ? (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-violet-500" />
                </div>
                <h4 className="font-semibold text-foreground mb-2">Hola, soy Madky</h4>
                <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
                  Tu analista de marketing. Preguntame sobre el rendimiento de tus clientes, 
                  pedime análisis o generá presentaciones.
                </p>
                <div className="mt-6 flex flex-col gap-2 w-full max-w-[280px]">
                  <button
                    onClick={() => setInput('Dame un resumen del rendimiento de este cliente')}
                    className="text-left px-3 py-2 text-xs bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                  >
                    Dame un resumen del rendimiento
                  </button>
                  <button
                    onClick={() => setInput('Detectá problemas u oportunidades en las campañas')}
                    className="text-left px-3 py-2 text-xs bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                  >
                    Detectá problemas u oportunidades
                  </button>
                  <button
                    onClick={() => setInput('Generá una presentación ejecutiva del cliente')}
                    className="text-left px-3 py-2 text-xs bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                  >
                    Generá una presentación ejecutiva
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message) => {
                  const text = getMessageText(message)
                  const toolInvocations = getToolInvocations(message)
                  const isUser = message.role === 'user'
                  
                  // Get running tools (call or partial-call state)
                  const runningTools = toolInvocations.filter(t => t.state === 'call' || t.state === 'partial-call')
                  
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        'flex gap-3',
                        isUser ? 'flex-row-reverse' : 'flex-row'
                      )}
                    >
                      <div
                        className={cn(
                          'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
                          isUser
                            ? 'bg-primary/10'
                            : 'bg-gradient-to-br from-violet-500 to-purple-600'
                        )}
                      >
                        {isUser ? (
                          <User className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Bot className="h-3.5 w-3.5 text-white" />
                        )}
                      </div>
                      <div
                        className={cn(
                          'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm',
                          isUser
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/60'
                        )}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{text}</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {/* Show running tool calls */}
                            {runningTools.length > 0 && (
                              <div className="flex flex-col gap-1.5">
                                {runningTools.map((tool, idx) => {
                                  const toolInfo = TOOL_LABELS[tool.toolName] || { label: tool.toolName, icon: 'search' }
                                  const IconComponent = {
                                    search: Search,
                                    database: Database,
                                    chart: BarChart3,
                                    users: Users,
                                  }[toolInfo.icon]
                                  
                                  return (
                                    <div 
                                      key={idx}
                                      className="flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 px-2 py-1.5 rounded-md"
                                    >
                                      <IconComponent className="h-3 w-3 animate-pulse" />
                                      <span>{toolInfo.label}...</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {/* Show text content */}
                            {text && (
                              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-3 first:prose-headings:mt-0">
                                <ReactMarkdown>
                                  {text.replace(/<!-- PRESENTATION_START -->[\s\S]*<!-- PRESENTATION_END -->/g, '').trim() || text}
                                </ReactMarkdown>
                                {parsePresentation(text) && (
                                  <button
                                    onClick={() => setViewMode('presentation')}
                                    className="mt-2 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                                  >
                                    <Presentation className="h-3.5 w-3.5" />
                                    Ver presentación generada
                                  </button>
                                )}
                              </div>
                            )}
                            {/* Show loading if no text and no tools */}
                            {!text && runningTools.length === 0 && (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {isLoading && messages.length > 0 && !getMessageText(messages[messages.length - 1]) && getToolInvocations(messages[messages.length - 1]).length === 0 && (
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="bg-muted/60 rounded-xl px-3.5 py-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-border/60 shrink-0">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribí tu mensaje..."
                className="min-h-[44px] max-h-[120px] resize-none text-sm"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500"
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar conversación
              </button>
            )}
          </form>
        </>
      ) : (
        /* Presentation Mode */
        <div className="flex-1 flex flex-col overflow-hidden">
          {presentationSlides && presentationSlides.length > 0 && (
            <>
              {/* Slide content */}
              <div className="flex-1 p-6 overflow-auto">
                <div className="max-w-2xl mx-auto">
                  <h2 className="text-2xl font-bold text-foreground mb-6">
                    {presentationSlides[currentSlide].title}
                  </h2>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>
                      {presentationSlides[currentSlide].content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Slide navigation */}
              <div className="px-4 py-3 border-t border-border/60 flex items-center justify-between shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentSlide + 1} / {presentationSlides.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentSlide(Math.min(presentationSlides.length - 1, currentSlide + 1))}
                  disabled={currentSlide === presentationSlides.length - 1}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              {/* Slide thumbnails */}
              <div className="px-4 py-2 border-t border-border/60 shrink-0">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {presentationSlides.map((slide, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlide(idx)}
                      className={cn(
                        'px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors',
                        idx === currentSlide
                          ? 'bg-violet-500/20 text-violet-400'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {slide.title}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
