'use client'

import { useState, useEffect, useRef, Component, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Send, RefreshCw, MessageSquare, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Error boundary to catch any rendering errors
class DiscordChatErrorBoundary extends Component<
  { children: ReactNode; channelName: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; channelName: string }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
          <AlertCircle className="h-8 w-8 text-destructive/50 mx-auto mb-2" />
          <p className="text-sm text-destructive">Error al cargar el chat de Discord</p>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => this.setState({ hasError: false })}
            className="mt-2"
          >
            Reintentar
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

interface DiscordMessage {
  id: string
  content: string
  author: {
    id: string
    username: string
    avatar: string | null
    isBot: boolean
  }
  timestamp: string
  attachments: { url: string; filename: string }[]
}

interface CurrentUser {
  id: string
  nombre: string
  apellido?: string
  avatar_url?: string | null
}

interface DiscordChatProps {
  channelId: string
  channelName: string
  currentUser?: CurrentUser | null
}

function DiscordChatInner({ channelId, channelName, currentUser }: DiscordChatProps) {
  const [messages, setMessages] = useState<DiscordMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const fetchMessages = async () => {
    try {
      setError(null)
      const response = await fetch(`/api/discord/messages?channelId=${channelId}&limit=30`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch messages')
      }
      
      setMessages(data.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading messages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isExpanded) {
      fetchMessages()
      // Poll for new messages every 10 seconds when expanded
      const interval = setInterval(fetchMessages, 10000)
      return () => clearInterval(interval)
    }
  }, [channelId, isExpanded])

  useEffect(() => {
    if (messagesEndRef.current && isExpanded) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isExpanded])

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return

    const messageContent = newMessage
    setSending(true)
    setNewMessage('') // Clear input immediately for better UX
    
    try {
      const response = await fetch('/api/discord/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, content: messageContent }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        setNewMessage(messageContent) // Restore message on error
        throw new Error(data.error || 'Failed to send message')
      }

      // Ensure message has all required fields before adding
      if (data.message && data.message.id) {
        // Use current user info for the message author display
        const userName = currentUser 
          ? `${currentUser.nombre}${currentUser.apellido ? ` ${currentUser.apellido}` : ''}`
          : 'Tu'
        
        const newMsg: DiscordMessage = {
          id: data.message.id,
          content: data.message.content || messageContent,
          author: {
            id: currentUser?.id || data.message.author?.id || 'unknown',
            username: userName,
            avatar: currentUser?.avatar_url || null,
            isBot: false,
          },
          timestamp: data.message.timestamp || new Date().toISOString(),
          attachments: data.message.attachments || [],
        }
        setMessages(prev => [...prev, newMsg])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error sending message')
    } finally {
      setSending(false)
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Hoy'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer'
    }
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }

  // Collapsed view - just a button to expand
  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        className="w-full gap-2 justify-start bg-[#5865F2]/5 border-[#5865F2]/20 hover:bg-[#5865F2]/10 hover:border-[#5865F2]/30"
        onClick={() => setIsExpanded(true)}
      >
        <MessageSquare className="h-4 w-4 text-[#5865F2]" />
        <span className="flex-1 text-left">Abrir chat de Discord</span>
        <span className="text-xs text-muted-foreground">#{channelName}</span>
      </Button>
    )
  }

  return (
    <div className="rounded-xl border border-[#5865F2]/20 bg-[#5865F2]/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#5865F2]/10 border-b border-[#5865F2]/20">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#5865F2]" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          <span className="text-sm font-medium text-foreground">#{channelName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchMessages}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsExpanded(false)}
          >
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <AlertCircle className="h-8 w-8 text-destructive/50 mb-2" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="ghost" size="sm" onClick={fetchMessages} className="mt-2">
              Reintentar
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No hay mensajes aun</p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const showDate = index === 0 || 
                formatDate(messages[index - 1].timestamp) !== formatDate(msg.timestamp)
              
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {formatDate(msg.timestamp)}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <div className="flex gap-2 group">
                    <Avatar className="h-7 w-7 shrink-0">
                      {msg.author.avatar && <AvatarImage src={msg.author.avatar} />}
                      <AvatarFallback className="text-[10px] bg-[#5865F2] text-white">
                        {msg.author.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={cn(
                          "text-xs font-semibold",
                          msg.author.isBot ? "text-[#5865F2]" : "text-foreground"
                        )}>
                          {msg.author.username}
                          {msg.author.isBot && (
                            <span className="ml-1 px-1 py-0.5 text-[9px] bg-[#5865F2] text-white rounded">
                              BOT
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.attachments.map((att, i) => (
                            <a
                              key={i}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#5865F2] hover:underline"
                            >
                              {att.filename}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-[#5865F2]/20">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Mensaje #${channelName}`}
            className="flex-1 h-8 text-sm bg-background/50"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            className="h-8 w-8 bg-[#5865F2] hover:bg-[#4752C4]"
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}

// Export wrapped component with error boundary
export function DiscordChat({ channelId, channelName, currentUser }: DiscordChatProps) {
  return (
    <DiscordChatErrorBoundary channelName={channelName}>
      <DiscordChatInner channelId={channelId} channelName={channelName} currentUser={currentUser} />
    </DiscordChatErrorBoundary>
  )
}
