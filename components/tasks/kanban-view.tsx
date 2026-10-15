'use client'

import { useCallback, useState } from 'react'
import type { TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, useTasksByStatus, STATUS_CONFIG, STATUS_ORDER } from '@/lib/tasks/task-store'
import { useSubtaskCounts } from '@/hooks/use-subtasks'
import type { ConexaSuggestion } from '@/hooks/use-conexa-suggestions'
import { prefetchTask } from '@/lib/tasks/prefetch-task'
import { TaskCard } from './task-card'
import { ChevronLeft, Plus } from 'lucide-react'
import { CardSkeleton, ClientSquares, PriorityPill, STATUS_DOT, toDate } from './view-parts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const INITIAL_VISIBLE_COUNT = 10
const RESOLVED_VISIBLE_COUNT = 4

interface KanbanColumnProps {
  status: TaskStatus
  onAddTask: (status: TaskStatus) => void
  loading: boolean
}

function KanbanColumn({ status, onAddTask, loading }: KanbanColumnProps) {
  const tasksByStatus = useTasksByStatus()
  const tasks = tasksByStatus[status]
  const { data: subtaskCounts } = useSubtaskCounts(tasks.map((t) => t.id))
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus)
  const config = STATUS_CONFIG[status]
  const [isExpanded, setIsExpanded] = useState(false)
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const collapsed = collapsedPref ?? (!loading && tasks.length === 0)
  const limit = status === 'resuelto' ? RESOLVED_VISIBLE_COUNT : INITIAL_VISIBLE_COUNT
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, limit)
  const hiddenCount = tasks.length - limit

  const dropHandlers = {
    onDragOver: useCallback((e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(true)
    }, []),
    onDragLeave: useCallback(() => setIsDragOver(false), []),
    onDrop: useCallback(
      (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
        const taskId = e.dataTransfer.getData('taskId')
        if (taskId) updateTaskStatus(taskId, status)
      },
      [status, updateTaskStatus],
    ),
  }

  const dot = <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_DOT[status] }} aria-hidden="true" />
  const count = (
    <span className="shrink-0 rounded-full bg-[var(--tasks-count)] px-1.5 text-[11.5px] font-semibold leading-5 text-[var(--tasks-text-2)]">
      {tasks.length}
    </span>
  )

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsedPref(false)}
        aria-label={`Expandir ${config.label}`}
        {...dropHandlers}
        className={cn(
          'flex w-11 shrink-0 flex-col items-center gap-2 rounded-[14px] border border-[var(--tasks-border)] bg-[var(--tasks-col)] py-3 transition-colors hover:border-[var(--tasks-border-hover)]',
          isDragOver && 'border-[var(--tasks-brand)]',
        )}
      >
        {dot}
        {count}
        <span className="text-[13px] font-bold text-[var(--tasks-text)] [writing-mode:vertical-rl]">{config.label}</span>
      </button>
    )
  }

  return (
    <section
      aria-label={config.label}
      {...dropHandlers}
      className={cn(
        'flex w-[280px] shrink-0 flex-col overflow-hidden rounded-[14px] border border-[var(--tasks-border)] bg-[var(--tasks-col)] transition-colors',
        isDragOver && 'border-[var(--tasks-brand)]',
      )}
    >
      <header className="flex items-center gap-2 px-[14px] pb-2.5 pt-3">
        {dot}
        <h3 className="truncate text-[13px] font-bold text-[var(--tasks-text)]">{config.label}</h3>
        {count}
        <button
          type="button"
          onClick={() => setCollapsedPref(true)}
          aria-label={`Contraer ${config.label}`}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-[var(--tasks-text-3)] hover:bg-[var(--tasks-count)] hover:text-[var(--tasks-text)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {loading && tasks.length === 0
          ? Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)
          : visibleTasks.map((task) => (
              <div
                key={task.id}
                onPointerEnter={() => prefetchTask(task.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('taskId', task.id)
                  e.currentTarget.classList.add('opacity-50')
                }}
                onDragEnd={(e) => e.currentTarget.classList.remove('opacity-50')}
              >
                <TaskCard task={task} onClick={() => setSelectedTask(task.id)} subtasks={subtaskCounts?.[task.id]} />
              </div>
            ))}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-lg py-1.5 text-[12.5px] font-semibold text-[var(--tasks-text-3)] hover:bg-[var(--tasks-count)] hover:text-[var(--tasks-text)]"
          >
            {isExpanded ? 'Ver menos' : `Ver ${hiddenCount} más`}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onAddTask(status)}
        className="flex items-center gap-1.5 border-t border-[var(--tasks-border-soft)] px-[14px] pb-3 pt-2 text-left text-[12.5px] text-[var(--tasks-text-3)] hover:text-[var(--tasks-text)]"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Agregar tarea
      </button>
    </section>
  )
}

function SuggestionsColumn({
  items,
  onCreate,
  onDismiss,
}: {
  items: ConexaSuggestion[]
  onCreate: (s: ConexaSuggestion) => void
  onDismiss: (id: string) => void
}) {
  return (
    <section
      id="conexa-suggestions"
      aria-label="Sugeridas por Conexa"
      className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-[14px] border border-dashed border-[var(--tasks-cx-border)] bg-[var(--tasks-cx-bg)]"
    >
      <header className="flex flex-col gap-1 px-[14px] pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-[var(--tasks-cx-text)]">✦ Sugeridas por Conexa</h3>
          <span className="rounded-full bg-[var(--tasks-card)] px-1.5 text-[11.5px] font-semibold leading-5 text-[var(--tasks-cx-text)]">
            {items.length}
          </span>
        </div>
        <p className="text-[11.5px] leading-4 text-[var(--tasks-cx-text)]">
          Desde CRM, Tracking, reuniones y comentarios de tus clientes.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {items.map((s) => (
          <SuggestionCard key={s.id} item={s} onCreate={() => onCreate(s)} onDismiss={() => onDismiss(s.id)} />
        ))}
      </div>
    </section>
  )
}

export function SuggestionCard({
  item,
  onCreate,
  onDismiss,
}: {
  item: ConexaSuggestion
  onCreate: () => void
  onDismiss: () => void
}) {
  const due = toDate(item.fecha_vencimiento ? `${item.fecha_vencimiento}T12:00:00` : null)
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-[var(--tasks-cx-border)] bg-[var(--tasks-card)] p-3">
      {item.cliente_nombre && (
        <ClientSquares clients={[{ id: item.cliente_id ?? item.cliente_nombre, name: item.cliente_nombre }]} conexa />
      )}
      <h4 className="line-clamp-3 text-[13.5px] font-semibold leading-[1.35] text-[var(--tasks-text)] [text-wrap:pretty]">
        {item.titulo}
      </h4>
      {item.detalles && item.detalles.length > 0 && (
        <p className="line-clamp-2 text-[11.5px] leading-4 text-[var(--tasks-text-3)]">{item.detalles[0]}</p>
      )}
      <div className="flex items-center gap-2">
        {item.prioridad && <PriorityPill priority={item.prioridad} />}
        {due && (
          <span className="text-[11.5px] font-semibold text-[var(--tasks-text-3)]">{format(due, 'd MMM', { locale: es })}</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDismiss}
          className="text-[12px] font-semibold text-[var(--tasks-text-3)] hover:text-[var(--tasks-text)]"
        >
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
    </article>
  )
}

interface KanbanViewProps {
  onAddTask: (status: TaskStatus) => void
  suggestions: ConexaSuggestion[]
  onCreateSuggestion: (s: ConexaSuggestion) => void
  onDismissSuggestion: (id: string) => void
}

export function KanbanView({ onAddTask, suggestions, onCreateSuggestion, onDismissSuggestion }: KanbanViewProps) {
  const isLoading = useTaskStore((s) => s.isLoading)
  return (
    <div className="flex h-full items-stretch gap-2.5 overflow-x-auto px-4 py-[14px]">
      {suggestions.length > 0 && (
        <SuggestionsColumn items={suggestions} onCreate={onCreateSuggestion} onDismiss={onDismissSuggestion} />
      )}
      {STATUS_ORDER.map((status) => (
        <KanbanColumn key={status} status={status} onAddTask={onAddTask} loading={isLoading} />
      ))}
    </div>
  )
}
