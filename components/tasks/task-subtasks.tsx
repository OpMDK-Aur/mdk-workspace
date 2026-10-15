'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Check, Plus, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SECTION_LABEL_CLASSES } from './task-panel-parts'

interface Subtask {
  id: string
  tarea_id: string
  titulo: string
  completada: boolean
  asignado_a: string | null
  orden: number
}

interface SubtaskColaborador {
  id: string
  nombre: string
  apellido?: string | null
  avatar_url: string | null
}

async function fetchSubtasks(taskId: string): Promise<Subtask[]> {
  const { data, error } = await createClient()
    .from('subtareas_tareas')
    .select('id, tarea_id, titulo, completada, asignado_a, orden')
    .eq('tarea_id', taskId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

function initials(c: SubtaskColaborador) {
  return `${c.nombre?.[0] ?? ''}${c.apellido?.[0] ?? ''}`.toUpperCase() || '?'
}

export function TaskSubtasks({
  taskId,
  colaboradores,
}: {
  taskId: string
  colaboradores: SubtaskColaborador[]
}) {
  const { data: subtasks = [], mutate } = useSWR(['subtareas', taskId], () => fetchSubtasks(taskId))
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const done = subtasks.filter(s => s.completada).length
  const progress = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0

  async function run(optimistic: Subtask[], op: () => PromiseLike<{ error: unknown }>) {
    const previous = subtasks
    mutate(optimistic, { revalidate: false })
    const { error } = await op()
    if (error) {
      mutate(previous, { revalidate: false })
      toast.error('No se pudo guardar la subtarea')
      return
    }
    mutate()
  }

  async function addSubtask() {
    const titulo = draft.trim().slice(0, 500)
    if (!titulo) return
    setDraft('')
    const orden = subtasks.length ? Math.max(...subtasks.map(s => s.orden)) + 1 : 0
    const temp: Subtask = { id: `tmp-${Date.now()}`, tarea_id: taskId, titulo, completada: false, asignado_a: null, orden }
    await run([...subtasks, temp], () =>
      createClient().from('subtareas_tareas').insert({ tarea_id: taskId, titulo, orden }),
    )
  }

  function update(id: string, patch: Partial<Pick<Subtask, 'completada' | 'asignado_a' | 'titulo'>>) {
    return run(
      subtasks.map(s => (s.id === id ? { ...s, ...patch } : s)),
      () => createClient().from('subtareas_tareas').update(patch).eq('id', id),
    )
  }

  function remove(id: string) {
    return run(
      subtasks.filter(s => s.id !== id),
      () => createClient().from('subtareas_tareas').delete().eq('id', id),
    )
  }

  return (
    <section aria-labelledby="subtasks-heading" className="mt-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="subtasks-heading" className={SECTION_LABEL_CLASSES}>
          Subtareas
          {subtasks.length > 0 && (
            <span className="ml-2 font-mono normal-case tracking-normal">{`${done}/${subtasks.length}`}</span>
          )}
        </h2>
        {subtasks.length > 0 && (
          <div
            className="h-1 w-24 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de subtareas"
          >
            <div className="h-full rounded-full bg-[#FF7F00] transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <ul className="flex flex-col">
        {subtasks.map(s => {
          const assignee = colaboradores.find(c => c.id === s.asignado_a)
          return (
            <li key={s.id} className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <button
                type="button"
                role="checkbox"
                aria-checked={s.completada}
                aria-label={`Marcar "${s.titulo}" como ${s.completada ? 'pendiente' : 'completada'}`}
                onClick={() => update(s.id, { completada: !s.completada })}
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                  s.completada ? 'border-[#FF7F00] bg-[#FF7F00] text-background' : 'border-border hover:border-[#FF7F00]',
                )}
              >
                {s.completada && <Check className="size-3" strokeWidth={3} />}
              </button>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  s.completada ? 'text-muted-foreground line-through' : 'text-foreground',
                )}
              >
                {s.titulo}
              </span>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={assignee ? `Asignada a ${assignee.nombre}` : 'Asignar subtarea'}
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold transition-opacity',
                      assignee ? 'bg-muted text-foreground' : 'text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100',
                    )}
                  >
                    {assignee ? (
                      assignee.avatar_url ? (
                        <img src={assignee.avatar_url} alt="" className="size-full object-cover" />
                      ) : (
                        initials(assignee)
                      )
                    ) : (
                      <UserRound className="size-3.5" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1">
                  <div className="max-h-60 overflow-y-auto">
                    {assignee && (
                      <button
                        type="button"
                        onClick={() => update(s.id, { asignado_a: null })}
                        className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                      >
                        Quitar responsable
                      </button>
                    )}
                    {colaboradores.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => update(s.id, { asignado_a: c.id })}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                          c.id === s.asignado_a && 'font-semibold',
                        )}
                      >
                        <span className="truncate">{`${c.nombre} ${c.apellido ?? ''}`.trim()}</span>
                        {c.id === s.asignado_a && <Check className="ml-auto size-3.5 text-[#FF7F00]" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <button
                type="button"
                aria-label={`Eliminar "${s.titulo}"`}
                onClick={() => remove(s.id)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>

      {adding ? (
        <div className="-mx-2 mt-1 flex items-center gap-2.5 px-2 py-1.5">
          <span className="size-4 shrink-0 rounded border border-dashed border-border" aria-hidden="true" />
          <input
            autoFocus
            value={draft}
            maxLength={500}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { if (!draft.trim()) setAdding(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                addSubtask()
              } else if (e.key === 'Escape') {
                setDraft('')
                setAdding(false)
              }
            }}
            placeholder="Nombre de la subtarea y Enter"
            aria-label="Nueva subtarea"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="-mx-2 mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="size-4" />
          Agregar subtarea
        </button>
      )}
    </section>
  )
}
