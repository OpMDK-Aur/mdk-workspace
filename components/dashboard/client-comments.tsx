'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Send, Trash2, MessageSquare, Sparkles, Search, Filter, X, Calendar } from 'lucide-react'
import { useChat } from '@ai-sdk/react'
import { cn } from '@/lib/utils'

interface ComentarioCliente {
  id: string
  cliente_id: string
  contenido: string
  autor: string
  creado_en: string
  actualizado_en: string
}

interface CurrentUser {
  id: string
  nombre: string
  apellido?: string
  avatar_url?: string | null
}

interface ClientCommentsProps {
  clientId: string
  currentUser: CurrentUser | null
}

export function ClientComments({ clientId, currentUser }: ClientCommentsProps) {
  const [comments, setComments] = useState<ComentarioCliente[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'comments' | 'ai'>('comments')
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [authorFilter, setAuthorFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  const supabase = createClient()
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // AI Chat
  const { messages, input, handleInputChange, handleSubmit, isLoading: aiLoading, setMessages } = useChat({
    api: '/api/client-chat',
    body: { clientId },
  })

  // Scroll to bottom when new AI messages arrive
  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  // Fetch comments
  useEffect(() => {
    async function fetchComments() {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('comentarios_clientes')
        .select('*')
        .eq('cliente_id', clientId)
        .order('creado_en', { ascending: false })

      if (fetchError) {
        setError('Error al cargar comentarios')
        console.error('[v0] Error fetching comments:', fetchError)
      } else {
        setComments(data || [])
      }

      setLoading(false)
    }

    fetchComments()
  }, [clientId, supabase])

  // Get unique authors for filter
  const uniqueAuthors = useMemo(() => {
    const authors = new Set(comments.map(c => c.autor))
    return Array.from(authors).sort()
  }, [comments])

  // Filtered comments
  const filteredComments = useMemo(() => {
    return comments.filter(comment => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesContent = comment.contenido.toLowerCase().includes(query)
        const matchesAuthor = comment.autor.toLowerCase().includes(query)
        if (!matchesContent && !matchesAuthor) return false
      }

      // Author filter
      if (authorFilter !== 'all' && comment.autor !== authorFilter) {
        return false
      }

      // Date filter
      if (dateFilter !== 'all') {
        const commentDate = new Date(comment.creado_en)
        const now = new Date()
        const diffDays = Math.floor((now.getTime() - commentDate.getTime()) / (1000 * 60 * 60 * 24))

        switch (dateFilter) {
          case 'today':
            if (diffDays > 0) return false
            break
          case 'week':
            if (diffDays > 7) return false
            break
          case 'month':
            if (diffDays > 30) return false
            break
        }
      }

      return true
    })
  }, [comments, searchQuery, authorFilter, dateFilter])

  // Add comment
  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser || sending) return

    setSending(true)
    setError(null)

    const autorName = `${currentUser.nombre}${currentUser.apellido ? ` ${currentUser.apellido}` : ''}`

    const { data, error: insertError } = await supabase
      .from('comentarios_clientes')
      .insert({
        cliente_id: clientId,
        contenido: newComment.trim(),
        autor: autorName,
      })
      .select()
      .single()

    if (insertError) {
      setError('Error al agregar comentario')
      console.error('[v0] Error adding comment:', insertError)
    } else if (data) {
      setComments(prev => [data, ...prev])
      setNewComment('')
    }

    setSending(false)
  }

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    const { error: deleteError } = await supabase
      .from('comentarios_clientes')
      .delete()
      .eq('id', commentId)

    if (deleteError) {
      setError('Error al eliminar comentario')
      console.error('[v0] Error deleting comment:', deleteError)
    } else {
      setComments(prev => prev.filter(c => c.id !== commentId))
    }
  }

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Ahora'
    if (diffMins < 60) return `Hace ${diffMins}m`
    if (diffHours < 24) return `Hace ${diffHours}h`
    if (diffDays < 7) return `Hace ${diffDays}d`
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }

  // Get initials from author name
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  }

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('')
    setAuthorFilter('all')
    setDateFilter('all')
  }

  const hasActiveFilters = searchQuery || authorFilter !== 'all' || dateFilter !== 'all'

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'comments' | 'ai')}>
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-9">
            <TabsTrigger value="comments" className="gap-1.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              Comentarios
              {comments.length > 0 && (
                <span className="ml-1 text-[10px] bg-muted px-1.5 rounded-full">
                  {comments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Asistente IA
            </TabsTrigger>
          </TabsList>

          {activeTab === 'comments' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "h-8 gap-1.5 text-xs",
                hasActiveFilters && "text-primary"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full">
                  {[searchQuery, authorFilter !== 'all', dateFilter !== 'all'].filter(Boolean).length}
                </span>
              )}
            </Button>
          )}
        </div>

        <TabsContent value="comments" className="mt-4 space-y-4">
          {/* Filters */}
          {showFilters && (
            <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Filtrar comentarios</span>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 text-xs gap-1">
                    <X className="h-3 w-3" />
                    Limpiar
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Select value={authorFilter} onValueChange={setAuthorFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Autor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los autores</SelectItem>
                    {uniqueAuthors.map(author => (
                      <SelectItem key={author} value={author}>{author}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    <SelectValue placeholder="Fecha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las fechas</SelectItem>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="week">Ultima semana</SelectItem>
                    <SelectItem value="month">Ultimo mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* New comment input */}
          {currentUser && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={currentUser.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {currentUser.nombre[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Textarea
                  placeholder="Escribe un comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[80px] resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      handleAddComment()
                    }
                  }}
                />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">
                    Cmd + Enter para enviar
                  </span>
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || sending}
                    className="gap-1.5"
                  >
                    {sending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Comentar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Filtered results info */}
          {!loading && hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              Mostrando {filteredComments.length} de {comments.length} comentarios
            </p>
          )}

          {/* Comments list */}
          {!loading && filteredComments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {hasActiveFilters 
                ? 'No hay comentarios que coincidan con los filtros.'
                : 'No hay comentarios aun. Se el primero en comentar.'
              }
            </p>
          )}

          {!loading && filteredComments.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {filteredComments.map((comment) => (
                <div
                  key={comment.id}
                  className="group rounded-lg border bg-muted/30 p-3"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(comment.autor)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{comment.autor}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(comment.creado_en)}
                          </span>
                        </div>
                        {currentUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{comment.contenido}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ai" className="mt-4 space-y-4">
          {/* AI Chat */}
          <div className="rounded-lg border bg-muted/20 overflow-hidden">
            {/* Chat messages */}
            <div 
              ref={chatContainerRef}
              className="h-[350px] overflow-y-auto p-4 space-y-4"
            >
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <Sparkles className="h-8 w-8 text-primary/50 mb-3" />
                  <h4 className="text-sm font-medium mb-1">Asistente IA del Cliente</h4>
                  <p className="text-xs text-muted-foreground max-w-[280px]">
                    Preguntame sobre tareas, comentarios, metricas de Google Ads/Meta, 
                    o cualquier informacion del cliente.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {[
                      'Resume la situacion del cliente',
                      'Que tareas estan pendientes?',
                      'Como van las campanas de Google Ads?',
                      'Busca comentarios sobre presupuesto',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          handleInputChange({ target: { value: suggestion } } as React.ChangeEvent<HTMLInputElement>)
                        }}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' && "flex-row-reverse"
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    {message.role === 'assistant' ? (
                      <>
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          <Sparkles className="h-3.5 w-3.5" />
                        </AvatarFallback>
                      </>
                    ) : (
                      <>
                        <AvatarImage src={currentUser?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-muted">
                          {currentUser?.nombre?.[0] || 'U'}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 max-w-[85%] text-sm",
                      message.role === 'user'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {message.parts?.map((part, i) => {
                          if (part.type === 'text') {
                            return <div key={i} dangerouslySetInnerHTML={{ __html: formatMarkdown(part.text) }} />
                          }
                          return null
                        })}
                      </div>
                    ) : (
                      <p>{message.parts?.map((part, i) => part.type === 'text' ? part.text : null)}</p>
                    )}
                  </div>
                </div>
              ))}

              {aiLoading && (
                <div className="flex gap-3">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <Sparkles className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Chat input */}
            <form onSubmit={handleSubmit} className="border-t p-3 flex gap-2">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Pregunta algo sobre el cliente..."
                className="flex-1 h-9 text-sm"
                disabled={aiLoading}
              />
              <Button type="submit" size="sm" disabled={!input.trim() || aiLoading} className="h-9 px-3">
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>

          {/* Clear chat button */}
          {messages.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessages([])}
                className="text-xs text-muted-foreground"
              >
                Limpiar conversacion
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Simple markdown formatter
function formatMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>')
    // Line breaks
    .replace(/\n/g, '<br />')
    // Lists
    .replace(/^- (.*?)(<br \/>|$)/gm, '<li class="ml-4">$1</li>')
}
