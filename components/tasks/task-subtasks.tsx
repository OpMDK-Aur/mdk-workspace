'use client'

import { useMemo, useRef, useState } from 'react'
import { format, isBefore, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, Check, GripVertical, MoreHorizontal, Plus, Sparkles, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRefreshSubtaskCounts, useSubtasks, type Subtask } from '@/hooks/use-subtasks'
import { parseSubtask, toISODate, trailingMention, type SubtaskUser } from '@/lib/tasks/parse-subtask'
import { CONEXA_CLASSES, SECTION_LABEL_CLASSES } from './task-panel-parts'

interface SubtaskColaborador {
  id: string
  nombre: string
  apellido?: string | null
  avatar_url: string | null
}

const fullName = (c: SubtaskColaborador) => `${c.nombre} ${c.apellido ?? ''}`.trim()
const initials = (c: SubtaskColaborador) =>
  `${c.nombre?.[0] ?? ''}${c.apellido?.[0] ?? ''}`.toUpperCase() || '?'
const formatDue = (d: Date) => format(d, 'd MMM', { locale: es }).replace('.', '')

type Patch = Partial<Pick<Subtask, 'title' | 'done' | 'assigneeId' | 'dueDate' | 'position'>>

async function request(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.status === 204 ? null : res.json()
}

function Avatar({ person, className }: { person: SubtaskColaborador; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold text-foreground',
        className,
      )}
    >
      {person.avatar_url ? <img src={person.avatar_url} alt="" className="size-full object-cover" /> : initials(person)}
    </span>
  )
}

function PeopleList({
  people,
  selectedId,
  onSelect,
  onClear,
}: {
  people: SubtaskColaborador[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear?: () => void
}) {
  return (
    <div className="max-h-60 overflow-y-auto">
      {onClear && selectedId && (
        <button
          type="button"
          onClick={onClear}
          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
        >
          Quitar responsable
        </button>
      )}
      {people.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
            c.id === selectedId && 'font-semibold',
          )}
        >
          <Avatar person={c} className="size-5" />
          <span className="truncate">{fullName(c)}</span>
          {c.id === selectedId && <Check className="ml-auto size-3.5 text-[#FF7F00]" />}
        </button>
      ))}
    </div>
  )
}

function SubtaskRow({
  subtask,
  people,
  onPatch,
  onDelete,
  onConvert,
}: {
  subtask: Subtask
  people: SubtaskColaborador[]
  onPatch: (patch: Patch) => void
  onDelete: () => void
  onConvert: () => void
}) {
  const pending = subtask.id.startsWith('tmp-')
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
    disabled: pending,
  })
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(subtask.title)
  const [dateOpen, setDateOpen] = useState(false)
  const [personOpen, setPersonOpen] = useState(false)

  const assignee = people.find(c => c.id === subtask.assigneeId)
  const due = subtask.dueDate ? parseISO(subtask.dueDate) : null
  const overdue = !!due && !subtask.done && isBefore(due, startOfDay(new Date()))

  function saveTitle() {
    const t = title.trim()
    setEditing(false)
    if (t && t !== subtask.title) onPatch({ title: t.slice(0, 500) })
    else setTitle(subtask.title)
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative flex h-10 items-center gap-2 border-b border-border px-2 last:border-b-0 hover:bg-muted/50',
        isDragging && 'z-10 bg-muted shadow-sm',
        pending && 'opacity-60',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reordenar "${subtask.title}"`}
        className="flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>

      <button
        type="button"
        role="checkbox"
        aria-checked={subtask.done}
        disabled={pending}
        aria-label={`Marcar "${subtask.title}" como ${subtask.done ? 'pendiente' : 'completada'}`}
        onClick={() => onPatch({ done: !subtask.done })}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
          subtask.done ? 'border-[#FF7F00] bg-[#FF7F00] text-background' : 'border-border hover:border-[#FF7F00]',
        )}
      >
        {subtask.done && <Check className="size-3" strokeWidth={3} />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={title}
          maxLength={500}
          aria-label="Editar subtarea"
          onChange={e => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              saveTitle()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setTitle(subtask.title)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded bg-background px-1 text-sm text-foreground outline-none ring-1 ring-[#FF7F00]"
        />
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setTitle(subtask.title)
            setEditing(true)
          }}
          className={cn(
            'min-w-0 flex-1 truncate text-left text-sm',
            subtask.done ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {subtask.title}
        </button>
      )}

      {subtask.aiGenerated && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn('flex size-5 shrink-0 items-center justify-center rounded border text-[10px]', CONEXA_CLASSES)}
              aria-label="Generada con Conexa"
            >
              <Sparkles className="size-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{subtask.source ?? 'Generada con Conexa'}</TooltipContent>
        </Tooltip>
      )}

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={due ? `Vence ${formatDue(due)}` : 'Agregar vencimiento'}
            className={cn(
              'flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-xs tabular-nums hover:bg-muted',
              overdue ? 'text-destructive' : 'text-muted-foreground',
              !due && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
            )}
          >
            {due ? formatDue(due) : <CalendarDays className="size-3.5" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={es}
            selected={due ?? undefined}
            onSelect={d => {
              setDateOpen(false)
              onPatch({ dueDate: d ? toISODate(d) : null })
            }}
          />
          {due && (
            <button
              type="button"
              onClick={() => {
                setDateOpen(false)
                onPatch({ dueDate: null })
              }}
              className="w-full border-t border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              Quitar vencimiento
            </button>
          )}
        </PopoverContent>
      </Popover>

      <Popover open={personOpen} onOpenChange={setPersonOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={assignee ? `Responsable: ${fullName(assignee)}` : 'Asignar subtarea'}
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full',
              !assignee &&
                'text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
            )}
          >
            {assignee ? <Avatar person={assignee} className="size-6" /> : <UserRound className="size-3.5" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-1">
          <PeopleList
            people={people}
            selectedId={subtask.assigneeId}
            onSelect={id => {
              setPersonOpen(false)
              onPatch({ assigneeId: id })
            }}
            onClear={() => {
              setPersonOpen(false)
              onPatch({ assigneeId: null })
            }}
          />
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label="Más acciones"
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onConvert}>Convertir en tarea</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function AddSubtaskRow({
  people,
  currentUserId,
  onCreate,
}: {
  people: SubtaskColaborador[]
  currentUserId: string | null
  onCreate: (items: { title: string; assigneeId: string | null; dueDate: string | null }[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const team: SubtaskUser[] = useMemo(() => people.map(p => ({ id: p.id, name: fullName(p) })), [people])
  const parsed = parseSubtask(draft, team)
  const mention = trailingMention(draft)
  const matches =
    mention === null
      ? []
      : people
          .filter(p => fullName(p).toLowerCase().split(' ').some(w => w.startsWith(mention.toLowerCase())))
          .slice(0, 6)
  const menuOpen = mention !== null && matches.length > 0

  const assigneeId = parsed.assignee?.id ?? currentUserId
  const assignee = people.find(p => p.id === assigneeId)

  function toItem(text: string) {
    const p = parseSubtask(text, team)
    if (!p.title) return null
    return {
      title: p.title.slice(0, 500),
      assigneeId: p.assignee?.id ?? currentUserId,
      dueDate: p.due ? toISODate(p.due) : null,
    }
  }

  function pickMention(p: SubtaskColaborador) {
    setDraft(d => d.replace(/@([\p{L}]*)$/u, `@${fullName(p)} `))
    setHighlight(0)
    inputRef.current?.focus()
  }

  function close() {
    setDraft('')
    setOpen(false)
  }

  function submit() {
    const item = toItem(draft)
    if (!item) return false
    onCreate([item])
    setDraft('')
    setHighlight(0)
    inputRef.current?.focus()
    return true
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-2 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Plus className="ml-6 size-4" />
        <span>Agregar subtarea</span>
        <span className="ml-auto hidden text-xs text-muted-foreground/80 sm:inline">
          Enter para agregar · @ para asignar
        </span>
      </button>
    )
  }

  return (
    <div className="relative px-2 py-2">
      <div className="flex h-6 items-center gap-2">
        <span className="ml-6 size-4 shrink-0 rounded border border-dashed border-border" aria-hidden="true" />
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          maxLength={600}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls="subtask-mention-menu"
          aria-label="Nueva subtarea"
          placeholder="Nueva subtarea… (ej: Revisar copy @Joshua viernes)"
          onChange={e => {
            setDraft(e.target.value)
            setHighlight(0)
          }}
          onBlur={e => {
            if (e.relatedTarget?.closest('#subtask-mention-menu, [data-subtask-submit]')) return
            if (draft.trim()) {
              const item = toItem(draft)
              if (item) onCreate([item])
            }
            close()
          }}
          onPaste={e => {
            const text = e.clipboardData.getData('text')
            if (!/\r?\n/.test(text)) return
            e.preventDefault()
            const items = text.split(/\r?\n/).map(toItem).filter((x): x is NonNullable<typeof x> => !!x)
            if (items.length) onCreate(items)
          }}
          onKeyDown={e => {
            if (menuOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault()
              setHighlight(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
              return
            }
            if (e.key === 'Enter') {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              if (menuOpen) return pickMention(matches[highlight])
              submit()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          data-subtask-submit
          disabled={!parsed.title}
          onMouseDown={e => e.preventDefault()}
          onClick={submit}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-[#FF7F00] px-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="size-3" />
          Agregar
        </button>
      </div>

      {draft.trim() && (
        <div className="ml-12 mt-1.5 flex flex-wrap items-center gap-1.5" aria-live="polite">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2 text-xs text-foreground">
            {assignee ? <Avatar person={assignee} className="size-4 text-[8px]" /> : <UserRound className="size-3" />}
            {assignee ? (assignee.id === currentUserId ? 'Vos' : fullName(assignee)) : 'Sin responsable'}
          </span>
          <span
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs',
              parsed.due ? 'border-border text-foreground' : 'border-dashed border-border text-muted-foreground',
            )}
          >
            <CalendarDays className="size-3" />
            {parsed.due ? `Vence ${formatDue(parsed.due)}` : 'Sin vencimiento'}
          </span>
        </div>
      )}

      {menuOpen && (
        <div
          id="subtask-mention-menu"
          role="listbox"
          className="absolute left-12 top-9 z-20 w-60 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickMention(p)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                i === highlight ? 'bg-muted' : 'hover:bg-muted',
              )}
            >
              <Avatar person={p} className="size-5" />
              <span className="truncate">{fullName(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export type SubtaskProposal = { title: string; assigneeId: string | null; source: string }

function resolvePerson(people: SubtaskColaborador[], hint: string | null) {
  if (!hint) return null
  const h = hint.toLowerCase()
  return people.find(p => p.id === hint) ?? people.find(p => fullName(p).toLowerCase().startsWith(h)) ?? null
}

function ProposedSubtasks({
  proposals,
  people,
  onAdd,
  onDiscard,
}: {
  proposals: SubtaskProposal[]
  people: SubtaskColaborador[]
  onAdd: (items: { title: string; assigneeId: string | null; source: string }[]) => void
  onDiscard: () => void
}) {
  const [checked, setChecked] = useState(() => proposals.map(() => true))
  const resolved = proposals.map(p => ({ ...p, person: resolvePerson(people, p.assigneeId) }))
  const count = checked.filter(Boolean).length

  return (
    <div
      role="group"
      aria-label="Subtareas propuestas por Conexa"
      className="mb-3 rounded-xl border border-[var(--task-sum-border)] bg-[var(--task-sum-bg)] p-3"
    >
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[.06em] text-[var(--task-sum-label)]">
        {'✦ Propuestas de Conexa'}
      </p>
      <ul className="flex flex-col gap-1">
        {resolved.map((p, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-[var(--task-sum-border)]/30">
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={e => setChecked(c => c.map((v, j) => (j === i ? e.target.checked : v)))}
                className="size-4 shrink-0 accent-[#5B5FE8]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--task-sum-strong)]">
                  <span aria-hidden="true" className="mr-1 text-[var(--task-sum-label)]">✦</span>
                  {p.title}
                </span>
                <span className="block truncate text-[11px] text-[var(--task-sum-meta)]">{p.source}</span>
              </span>
              {p.person ? (
                <Avatar person={p.person} className="size-5 shrink-0" />
              ) : (
                <span className="text-[11px] text-[var(--task-sum-meta)]">Sin asignar</span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={count === 0}
          onClick={() =>
            onAdd(
              resolved
                .filter((_, i) => checked[i])
                .map(p => ({ title: p.title, assigneeId: p.person?.id ?? null, source: p.source })),
            )
          }
          className="h-7 rounded-full bg-[#5B5FE8] px-3 text-[12px] font-semibold text-[#FFFFFF] hover:brightness-110 disabled:opacity-50"
        >
          {`Agregar ${count}`}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="h-7 rounded-full px-3 text-[12px] font-semibold text-[var(--task-sum-meta)] hover:text-[var(--task-sum-strong)]"
        >
          Descartar
        </button>
      </div>
    </div>
  )
}

export function TaskSubtasks({
  taskId,
  colaboradores,
  currentUserId,
  onResolveTask,
  proposals,
  onProposalsClose,
}: {
  taskId: string
  colaboradores: SubtaskColaborador[]
  currentUserId: string | null
  onResolveTask?: () => void
  proposals?: SubtaskProposal[] | null
  onProposalsClose?: () => void
}) {
  const { data: subtasks = [], mutate } = useSubtasks(taskId)
  const refreshCounts = useRefreshSubtaskCounts()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const done = subtasks.filter(s => s.done).length
  const progress = subtasks.length ? (done / subtasks.length) * 100 : 0

  async function commit(
    apply: (current: Subtask[]) => Subtask[],
    send: () => Promise<((current: Subtask[]) => Subtask[]) | void>,
  ): Promise<boolean> {
    let previous: Subtask[] = []
    await mutate(
      current => {
        previous = current ?? []
        return apply(previous)
      },
      { revalidate: false },
    )
    try {
      const reconcile = await send()
      if (reconcile) await mutate(current => reconcile(current ?? []), { revalidate: false })
      refreshCounts()
      return true
    } catch {
      await mutate(previous, { revalidate: false })
      toast.error('No pudimos guardar la subtarea', {
        action: { label: 'Reintentar', onClick: () => void commit(apply, send) },
      })
      return false
    }
  }

  function create(
    items: { title: string; assigneeId: string | null; dueDate: string | null; aiGenerated?: boolean; source?: string | null }[],
  ) {
    for (const item of items) {
      const tempId = `tmp-${crypto.randomUUID()}`
      commit(
        current => [
          ...current,
          {
            id: tempId,
            taskId,
            title: item.title,
            done: false,
            assigneeId: item.assigneeId,
            dueDate: item.dueDate,
            position: current.length ? Math.max(...current.map(s => s.position)) + 1 : 0,
            aiGenerated: item.aiGenerated ?? false,
            source: item.source ?? null,
            createdAt: new Date().toISOString(),
          },
        ],
        async () => {
          const created: Subtask = await request(`/api/tasks/${taskId}/subtasks`, 'POST', item)
          return current => current.map(s => (s.id === tempId ? created : s))
        },
      )
    }
  }

  async function patch(id: string, changes: Patch) {
    const completesAll =
      changes.done === true && subtasks.filter(s => !s.done).length === 1 && subtasks.find(s => s.id === id)?.done === false
    const ok = await commit(
      current => current.map(s => (s.id === id ? { ...s, ...changes } : s)),
      async () => {
        await request(`/api/subtasks/${id}`, 'PATCH', changes)
      },
    )
    if (ok && completesAll) {
      toast.success('Completaste todas las subtareas', {
        action: onResolveTask ? { label: 'Marcar tarea como resuelta', onClick: onResolveTask } : undefined,
      })
    }
  }

  function remove(id: string) {
    commit(
      current => current.filter(s => s.id !== id),
      async () => {
        await request(`/api/subtasks/${id}`, 'DELETE')
      },
    )
  }

  async function convert(id: string) {
    const ok = await commit(
      current => current.filter(s => s.id !== id),
      async () => {
        await request(`/api/subtasks/${id}/convert`, 'POST')
      },
    )
    if (ok) toast.success('Subtarea convertida en tarea')
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = subtasks.findIndex(s => s.id === active.id)
    const to = subtasks.findIndex(s => s.id === over.id)
    if (from < 0 || to < 0) return
    const reordered = arrayMove(subtasks, from, to).map((s, i) => ({ ...s, position: i }))
    const changed = reordered.filter(s => subtasks.find(o => o.id === s.id)?.position !== s.position)
    commit(
      () => reordered,
      async () => {
        await Promise.all(changed.map(s => request(`/api/subtasks/${s.id}`, 'PATCH', { position: s.position })))
      },
    )
  }

  return (
    <section aria-labelledby="subtasks-heading" className="mt-8">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="subtasks-heading" className={SECTION_LABEL_CLASSES}>
          Subtareas
        </h2>
        {subtasks.length > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">{`${done}/${subtasks.length}`}</span>
        )}
        <button
          type="button"
          onClick={() => toast.info('Dividir con Conexa', { description: 'Esta acción estará disponible pronto.' })}
          className={cn(
            'ml-auto inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-opacity hover:opacity-90',
            CONEXA_CLASSES,
          )}
        >
          <Sparkles className="size-3.5" />
          Dividir con Conexa
        </button>
      </div>

      {proposals && proposals.length > 0 && (
        <ProposedSubtasks
          key={proposals.map(p => p.title).join('|')}
          proposals={proposals}
          people={colaboradores}
          onAdd={items => {
            create(items.map(p => ({ ...p, dueDate: null, aiGenerated: true })))
            onProposalsClose?.()
          }}
          onDiscard={() => onProposalsClose?.()}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        {subtasks.length > 0 && (
          <div
            className="h-1 bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de subtareas"
          >
            <div className="h-full bg-[#FF7F00] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={subtasks.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col">
              {subtasks.map(s => (
                <SubtaskRow
                  key={s.id}
                  subtask={s}
                  people={colaboradores}
                  onPatch={changes => patch(s.id, changes)}
                  onDelete={() => remove(s.id)}
                  onConvert={() => convert(s.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <div className={cn(subtasks.length > 0 && 'border-t border-border')}>
          <AddSubtaskRow people={colaboradores} currentUserId={currentUserId} onCreate={create} />
        </div>
      </div>
    </section>
  )
}
