'use client'

import { useMemo, useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowUpDown, Pencil, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { addDevComment, deleteDevComment, updateDevComment } from '@/app/actions/aurelia-followup'
import type { DevComment } from '@/lib/aurelia/followup-shared'
import { useDevTaskComments } from '../use-aurelia-followup'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
const isComposing = (event: React.KeyboardEvent) => event.nativeEvent.isComposing || event.keyCode === 229

export function DevTaskComments({ taskId }: { taskId: string }) {
  const { data, isLoading, mutate } = useDevTaskComments(taskId)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [draft, setDraft] = useState('')
  const [sending, startSending] = useTransition()
  const ready = data?.available ? data : null

  const comments = useMemo(() => {
    const list = [...(ready?.comments ?? [])]
    return sortOrder === 'newest' ? list.reverse() : list
  }, [ready, sortOrder])

  const send = () => {
    if (!draft.trim() || sending) return
    startSending(async () => {
      const result = await addDevComment(taskId, draft)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDraft('')
      await mutate()
    })
  }

  return (
    <section aria-labelledby={`comments-${taskId}`} className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/30">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 id={`comments-${taskId}`} className="text-sm font-semibold">Comentarios ({ready?.comments.length ?? 0})</h3>
        {(ready?.comments.length ?? 0) > 1 && (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}>
            <ArrowUpDown className="size-3" aria-hidden="true" />
            {sortOrder === 'newest' ? 'Más recientes' : 'Más antiguos'}
          </Button>
        )}
      </header>

      <div className="flex min-h-40 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {data && !data.available ? (
          <p className="text-sm text-muted-foreground">{data.message}</p>
        ) : isLoading && !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Cargando comentarios...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay comentarios. Contá avances, dudas o próximos pasos.</p>
        ) : (
          comments.map((comment) => <CommentItem key={comment.id} comment={comment} mine={comment.autorId === ready?.viewerId} onChanged={() => mutate()} />)
        )}
      </div>

      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(event) => { event.preventDefault(); send() }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !isComposing(event)) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Escribí un comentario..."
          aria-label="Nuevo comentario"
          rows={2}
          maxLength={4000}
          disabled={!ready}
          className="resize-none bg-background"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Enter para enviar · Shift + Enter para salto de línea</span>
          <Button type="submit" size="sm" className="gap-1.5" disabled={!ready || sending || !draft.trim()}>
            {sending ? <Spinner /> : <Send className="size-3.5" aria-hidden="true" />}
            Comentar
          </Button>
        </div>
      </form>
    </section>
  )
}

function CommentItem({ comment, mine, onChanged }: { comment: DevComment; mine: boolean; onChanged: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.contenido)
  const [pending, startTransition] = useTransition()
  const created = new Date(comment.createdAt)

  const save = () => {
    if (!text.trim()) return
    startTransition(async () => {
      const result = await updateDevComment(comment.id, text)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setEditing(false)
      await onChanged()
    })
  }

  const remove = () => {
    if (!window.confirm('¿Borrar este comentario?')) return
    startTransition(async () => {
      const result = await deleteDevComment(comment.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      await onChanged()
    })
  }

  return (
    <article className="group flex w-full items-start gap-3">
      <Avatar className="mt-0.5 size-8 shrink-0">
        <AvatarImage src={comment.autorAvatar ?? undefined} alt="" />
        <AvatarFallback className="text-xs">{initials(comment.autorName)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{comment.autorName}</span>
          <time dateTime={comment.createdAt} title={created.toLocaleString('es-AR')} className="text-xs text-muted-foreground">
            {formatDistanceToNow(created, { addSuffix: true, locale: es })}
          </time>
          {comment.editado && <span className="text-xs text-muted-foreground">(editado)</span>}
          {mine && !editing && (
            <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => { setText(comment.contenido); setEditing(true) }} aria-label="Editar comentario">
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" onClick={remove} disabled={pending} aria-label="Borrar comentario">
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={4000} aria-label="Editar comentario" autoFocus className="bg-background" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>Cancelar</Button>
              <Button type="button" size="sm" onClick={save} disabled={pending || !text.trim()}>{pending && <Spinner />}Guardar</Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-pretty">{comment.contenido}</p>
        )}
      </div>
    </article>
  )
}
