'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Send, Trash2, MessageSquare } from 'lucide-react'

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

  const supabase = createClient()

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Comentarios
        </h3>
        {comments.length > 0 && (
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        )}
      </div>

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

      {/* Comments list */}
      {!loading && comments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No hay comentarios aun. Se el primero en comentar.
        </p>
      )}

      {!loading && comments.length > 0 && (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {comments.map((comment) => (
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
    </div>
  )
}
