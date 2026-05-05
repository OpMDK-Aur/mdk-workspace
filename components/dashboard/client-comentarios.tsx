'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MessageSquare, Send, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Comentario {
  id: string
  cliente_id: string
  contenido: string
  autor: string
  creado_en: string
}

interface ClientComentariosProps {
  clienteId: string
  autorActual: string
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatFecha(fecha: string) {
  const date = new Date(fecha)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Ahora'
  if (diffMins < 60) return `Hace ${diffMins} min`
  if (diffHours < 24) return `Hace ${diffHours}h`
  if (diffDays < 7) return `Hace ${diffDays} días`
  
  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

export function ClientComentarios({ clienteId, autorActual }: ClientComentariosProps) {
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [nuevoComentario, setNuevoComentario] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [eliminando, setEliminando] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    cargarComentarios()
  }, [clienteId])

  const cargarComentarios = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('comentarios_clientes')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('creado_en', { ascending: false })

    if (data && !error) {
      setComentarios(data)
    }
    setLoading(false)
  }

  const enviarComentario = async () => {
    if (!nuevoComentario.trim()) return
    
    setEnviando(true)
    try {
      const { data, error } = await supabase
        .from('comentarios_clientes')
        .insert({
          cliente_id: clienteId,
          contenido: nuevoComentario.trim(),
          autor: autorActual
        })
        .select()
        .single()

      if (data && !error) {
        setComentarios([data, ...comentarios])
        setNuevoComentario('')
      }
    } catch (e) {
      console.error('Error al enviar comentario:', e)
    } finally {
      setEnviando(false)
    }
  }

  const eliminarComentario = async (id: string) => {
    setEliminando(id)
    try {
      const { error } = await supabase
        .from('comentarios_clientes')
        .delete()
        .eq('id', id)

      if (!error) {
        setComentarios(comentarios.filter(c => c.id !== id))
      }
    } catch (e) {
      console.error('Error al eliminar comentario:', e)
    } finally {
      setEliminando(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviarComentario()
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Comentarios del equipo
          {comentarios.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground ml-1">
              ({comentarios.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input para nuevo comentario */}
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs">
              {initials(autorActual)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 flex gap-2">
            <Textarea
              value={nuevoComentario}
              onChange={(e) => setNuevoComentario(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un comentario..."
              className="min-h-[80px] text-sm resize-none"
              disabled={enviando}
            />
            <Button 
              size="icon" 
              onClick={enviarComentario} 
              disabled={enviando || !nuevoComentario.trim()}
              className="shrink-0 self-end"
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Lista de comentarios */}
        {comentarios.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay comentarios aún.</p>
            <p className="text-xs mt-1">Sé el primero en dejar un comentario sobre este cliente.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {comentarios.map((comentario) => (
              <div key={comentario.id} className="flex gap-3 group">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    {initials(comentario.autor)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {comentario.autor}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatFecha(comentario.creado_en)}
                    </span>
                    {comentario.autor === autorActual && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 transition-opacity",
                          "text-muted-foreground hover:text-destructive"
                        )}
                        onClick={() => eliminarComentario(comentario.id)}
                        disabled={eliminando === comentario.id}
                      >
                        {eliminando === comentario.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                    {comentario.contenido}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
