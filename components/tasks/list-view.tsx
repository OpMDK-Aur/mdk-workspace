'use client'

import { useMemo, useState } from 'react'
import type { Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, useFilteredTasks, STATUS_CONFIG, STATUS_ORDER } from '@/lib/tasks/task-store'
import { useSubtaskCounts } from '@/hooks/use-subtasks'
import type { ConexaSuggestion } from '@/hooks/use-conexa-suggestions'
import { prefetchTask } from '@/lib/tasks/prefetch-task'
import { TaskStartButton } from './task-start-button'
import { TaskTimeLabel } from './task-time-label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowDown, ArrowUp, ChevronDown, CircleCheck, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ClientSquares,
  PeopleStack,
  PriorityPill,
  STATUS_DOT,
  TypeChip,
  formatCreated,
  formatDuration,
  getDueInfo,
  getRiskNote,
  getTaskClients,
  getTaskPeople,
  getTypeLabel,
  stripClientFromTitle,
  toDate,
  useLiveTime,
} from './view-parts'

const GRID = 'minmax(300px,2.6fr) minmax(140px,1.2fr) minmax(110px,1fr) 80px minmax(120px,1fr) 110px 112px 80px 80px'

type SortKey = 'title' | 'clientName' | 'priority' | 'dueDate' | 'totalTimeSec' | 'createdAt'
const PRIORITY_RANK = { alta: 0, media: 1, baja: 2 } as const

function compare(a: Task, b: Task, key: SortKey) {
  switch (key) {
    case 'title':
      return a.title.localeCompare(b.title, 'es')
    case 'clientName':
      return (a.clientName ?? '').localeCompare(b.clientName ?? '', 'es')
    case 'priority':
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    case 'totalTimeSec':
      return a.totalTimeSec - b.totalTimeSec
    case 'createdAt':
      return (toDate(a.createdAt)?.getTime() ?? 0) - (toDate(b.createdAt)?.getTime() ?? 0)
    case 'dueDate': {
      const da = toDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const db = toDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
      return da - db
    }
  }
}

function TaskRow({
  task,
  selected,
  onSelect,
  subtasks,
}: {
  task: Task
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  subtasks?: { done: number; total: number }
}) {
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const liveTime = useLiveTime(task)
  const clients = getTaskClients(task)
  const due = getDueInfo(task)
  const risk = getRiskNote(task)
  const created = formatCreated(task)

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => setSelectedTask(task.id)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === 'Enter') setSelectedTask(task.id)
      }}
      onPointerEnter={() => prefetchTask(task.id)}
      style={{ gridTemplateColumns: GRID }}
      className={cn(
        'grid cursor-pointer items-center gap-3 border-b border-[var(--tasks-border-soft)] px-4 py-2.5 text-[12.5px] transition-colors',
        'hover:bg-[var(--tasks-row-hover)] focus-visible:bg-[var(--tasks-row-hover)] focus-visible:outline-none',
        task.status === 'resuelto' && 'opacity-[.62]',
      )}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2.5">
        <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelect(task.id, c === true)}
            aria-label={`Seleccionar ${task.title}`}
          />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            {task.isSystemTask && (
              <span className="shrink-0 text-[var(--tasks-cx-label)]" aria-label="Creada por Conexa" title="Creada por Conexa">
                ✦
              </span>
            )}
            <span className="truncate text-[13px] font-semibold text-[var(--tasks-text)]">
              {stripClientFromTitle(task.title, clients)}
            </span>
            {subtasks && subtasks.total > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-[var(--tasks-text-3)]">
                <CircleCheck className="h-3 w-3" aria-hidden="true" />
                {subtasks.done}/{subtasks.total}
              </span>
            )}
          </span>
          {risk && <span className="truncate text-[11.5px] text-[var(--tasks-cx-text)]">✦ {risk}</span>}
        </div>
      </div>
      <div role="cell" className="min-w-0">
        <ClientSquares clients={clients} />
      </div>
      <div role="cell" className="flex min-w-0">
        <TypeChip label={getTypeLabel(task)} />
      </div>
      <div role="cell">
        <PriorityPill priority={task.priority} />
      </div>
      <div role="cell" className="min-w-0">
        <PeopleStack people={getTaskPeople(task)} showSingleName />
      </div>
      <div
        role="cell"
        className={cn(
          'truncate font-semibold',
          due?.tone === 'overdue' ? 'text-[var(--tasks-overdue)]' : 'text-[var(--tasks-text-3)]',
        )}
      >
        {due?.text ?? '—'}
      </div>
      <div role="cell" className="flex items-center gap-1 font-mono tabular-nums text-[var(--tasks-text-3)]">
        <TaskStartButton task={task} />
        <TaskTimeLabel taskId={task.id} part="mine" />
      </div>
      <div role="cell" className="text-[var(--tasks-text-3)]">
        <TaskTimeLabel taskId={task.id} part="total" />
      </div>
      <div role="cell" className="truncate text-[var(--tasks-text-3)]">
        {created ?? '—'}
      </div>
    </div>
  )
}

function SuggestionRow({ item, onCreate, onDismiss }: { item: ConexaSuggestion; onCreate: () => void; onDismiss: () => void }) {
  const due = toDate(item.fecha_vencimiento ? `${item.fecha_vencimiento}T12:00:00` : null)
  return (
    <div
      role="row"
      style={{ gridTemplateColumns: GRID }}
      className="grid items-center gap-3 border-b border-dashed border-[var(--tasks-cx-border)] px-4 py-2.5 text-[12.5px]"
    >
      <div role="cell" className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[var(--tasks-cx-label)]" aria-hidden="true">
          ✦
        </span>
        <span className="truncate text-[13px] font-semibold text-[var(--tasks-text)]">{item.titulo}</span>
      </div>
      <div role="cell" className="min-w-0">
        {item.cliente_nombre && <ClientSquares clients={[{ id: item.cliente_id ?? item.cliente_nombre, name: item.cliente_nombre }]} />}
      </div>
      <div role="cell" />
      <div role="cell">{item.prioridad && <PriorityPill priority={item.prioridad} />}</div>
      <div role="cell" />
      <div role="cell" className="font-semibold text-[var(--tasks-text-3)]">
        {due ? format(due, 'd MMM', { locale: es }) : '—'}
      </div>
      <div role="cell" className="col-span-2 flex items-center justify-end gap-2">
        <button type="button" onClick={onDismiss} className="text-[12px] font-semibold text-[var(--tasks-text-3)] hover:text-[var(--tasks-text)]">
          Descartar
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="h-7 rounded-full bg-[var(--tasks-cx-btn)] px-3 text-[12px] font-bold text-[var(--tasks-cx-btn-fg)] hover:opacity-90"
        >
          Crear
        </button>
      </div>
    </div>
  )
}

function GroupHeader({
  label,
  count,
  dot,
  open,
  onToggle,
  conexa,
}: {
  label: string
  count: number
  dot: string
  open: boolean
  onToggle: () => void
  conexa?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        'flex w-full items-center gap-2 border-b px-4 py-2 text-left',
        conexa
          ? 'border-[var(--tasks-cx-border)] bg-[var(--tasks-cx-bg)]'
          : 'border-[var(--tasks-border-soft)] bg-[var(--tasks-col)]',
      )}
    >
      <ChevronDown
        className={cn('h-3.5 w-3.5 text-[var(--tasks-text-3)] transition-transform', !open && '-rotate-90')}
        aria-hidden="true"
      />
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden="true" />
      <span className={cn('text-[13px] font-bold', conexa ? 'text-[var(--tasks-cx-text)]' : 'text-[var(--tasks-text)]')}>
        {label}
      </span>
      <span className="rounded-full bg-[var(--tasks-count)] px-1.5 text-[11.5px] font-semibold leading-5 text-[var(--tasks-text-2)]">
        {count}
      </span>
    </button>
  )
}

interface ListViewProps {
  suggestions: ConexaSuggestion[]
  onCreateSuggestion: (s: ConexaSuggestion) => void
  onDismissSuggestion: (id: string) => void
}

export function ListView({ suggestions, onCreateSuggestion, onDismissSuggestion }: ListViewProps) {
  const tasks = useFilteredTasks()
  const isLoading = useTaskStore((s) => s.isLoading)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const { data: subtaskCounts } = useSubtaskCounts(tasks.map((t) => t.id))
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const [closed, setClosed] = useState<Set<string>>(() => new Set(['resuelto', 'no_realizado']))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const groups = useMemo(() => {
    return STATUS_ORDER.map((status) => {
      let items = tasks.filter((t) => t.status === status)
      if (sort) {
        items = [...items].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * compare(a, b, sort.key))
      }
      return { status, items }
    }).filter((g) => g.items.length > 0)
  }, [tasks, sort])

  const toggleGroup = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const handleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? (prev.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }))

  const handleSelect = (id: string, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const handleBulkDelete = async () => {
    setIsDeleting(true)
    await deleteTasks(Array.from(selectedIds))
    setSelectedIds(new Set())
    setIsDeleting(false)
    setShowDeleteDialog(false)
  }

  const HeaderCell = ({ label, sortKey }: { label: string; sortKey?: SortKey }) => {
    if (!sortKey) return <div role="columnheader">{label}</div>
    const active = sort?.key === sortKey
    return (
      <div role="columnheader" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className={cn('flex items-center gap-1 uppercase hover:text-[var(--tasks-text)]', active && 'text-[var(--tasks-text)]')}
        >
          {label}
          {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {selectedIds.size > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--tasks-border)] bg-[var(--tasks-card)] px-4 py-2">
          <span className="text-[12.5px] text-[var(--tasks-text-2)]">
            {selectedIds.size} tarea{selectedIds.size > 1 ? 's' : ''} seleccionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <Button variant="destructive" size="sm" className="h-7" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Eliminar
          </Button>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelectedIds(new Set())}>
            Cancelar
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto" role="table" aria-label="Tareas">
        <div className="min-w-[1080px]">
          <div
            role="row"
            style={{ gridTemplateColumns: GRID }}
            className="sticky top-0 z-10 grid gap-3 border-b border-[var(--tasks-border)] bg-[var(--tasks-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--tasks-text-3)]"
          >
            <HeaderCell label="Tarea" sortKey="title" />
            <HeaderCell label="Cliente" sortKey="clientName" />
            <HeaderCell label="Tipo" />
            <HeaderCell label="Prioridad" sortKey="priority" />
            <HeaderCell label="Responsable" />
            <HeaderCell label="Vence" sortKey="dueDate" />
            <HeaderCell label="Mi tiempo" />
            <HeaderCell label="Total" />
            <HeaderCell label="Creada" sortKey="createdAt" />
          </div>

          {isLoading && tasks.length === 0 &&
            Array.from({ length: 8 }, (_, i) => (
              <div key={i} style={{ gridTemplateColumns: GRID }} className="grid items-center gap-3 border-b border-[var(--tasks-border-soft)] px-4 py-3" aria-hidden="true">
                <div className="tasks-skeleton h-3.5 w-4/5 rounded" />
                <div className="tasks-skeleton h-3.5 w-3/5 rounded" />
                <div className="tasks-skeleton h-4 w-16 rounded-full" />
                <div className="tasks-skeleton h-4 w-12 rounded-full" />
                <div className="tasks-skeleton h-5 w-5 rounded-full" />
                <div className="tasks-skeleton h-3.5 w-14 rounded" />
                <div className="tasks-skeleton h-3.5 w-10 rounded" />
                <div className="tasks-skeleton h-3.5 w-10 rounded" />
              </div>
            ))}

          {suggestions.length > 0 && (
            <div role="rowgroup" id="conexa-suggestions">
              <GroupHeader
                label="✦ Sugeridas por Conexa"
                count={suggestions.length}
                dot="var(--tasks-cx-btn)"
                open={!closed.has('conexa')}
                onToggle={() => toggleGroup('conexa')}
                conexa
              />
              {!closed.has('conexa') &&
                suggestions.map((s) => (
                  <SuggestionRow key={s.id} item={s} onCreate={() => onCreateSuggestion(s)} onDismiss={() => onDismissSuggestion(s.id)} />
                ))}
            </div>
          )}

          {groups.map(({ status, items }) => (
            <div role="rowgroup" key={status}>
              <GroupHeader
                label={STATUS_CONFIG[status as TaskStatus].label}
                count={items.length}
                dot={STATUS_DOT[status as TaskStatus]}
                open={!closed.has(status)}
                onToggle={() => toggleGroup(status)}
              />
              {!closed.has(status) &&
                items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={selectedIds.has(task.id)}
                    onSelect={handleSelect}
                    subtasks={subtaskCounts?.[task.id]}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tareas</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por eliminar {selectedIds.size} tarea{selectedIds.size > 1 ? 's' : ''}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
