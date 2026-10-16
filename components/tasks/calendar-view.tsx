'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, addWeeks, format, isSameMonth, isToday, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTaskStore, useFilteredTasks, STATUS_CONFIG } from '@/lib/tasks/task-store'
import { prefetchTask } from '@/lib/tasks/prefetch-task'
import type { Task } from '@/lib/types'
import type { ConexaSuggestion } from '@/hooks/use-conexa-suggestions'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NewTaskModal } from './new-task-modal'
import { TaskStartButton } from './task-start-button'
import { TaskTimeLabel } from './task-time-label'
import { STATUS_DOT, getTaskClients, getTaskPeople, isOpenTask, isOverdue, stripClientFromTitle, toDate } from './view-parts'

const WEEKS = 4
const DEFAULT_MAX_ITEMS = 3
const MIN_ROW_HEIGHT = 84
const ITEM_HEIGHT = 28
const CELL_CHROME_HEIGHT = 40
const MORE_BUTTON_HEIGHT = 22
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type DayItem = { kind: 'task'; task: Task } | { kind: 'suggestion'; item: ConexaSuggestion }

function CalendarTaskItem({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const clients = getTaskClients(task)
  const people = getTaskPeople(task)
  const overdue = isOverdue(task)
  return (
    <div
      className={cn(
        'group flex w-full min-w-0 items-center rounded-md border border-[var(--tasks-border)] bg-[var(--tasks-card)] hover:border-[var(--tasks-border-hover)]',
        task.status === 'resuelto' && 'opacity-[.62]',
      )}
    >
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          onPointerEnter={() => prefetchTask(task.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-[11.5px]"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[task.status] }} aria-hidden="true" />
          <span className={cn('truncate font-semibold', overdue ? 'text-[var(--tasks-overdue)]' : 'text-[var(--tasks-text)]')}>
            {stripClientFromTitle(task.title, clients)}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-semibold">{task.title}</p>
        <p className="opacity-80">
          {STATUS_CONFIG[task.status]?.label}
          {clients.length > 0 && ` · ${clients.map((c) => c.name).join(' + ')}`}
        </p>
        <p className="opacity-80">{people.length ? people.map((p) => p.nombre).join(', ') : 'Sin responsable'}</p>
      </TooltipContent>
    </Tooltip>
    <TaskTimeLabel taskId={task.id} part="total" className="shrink-0 text-[10.5px] text-[var(--tasks-text-3)]" />
    <TaskStartButton task={task} className="mr-0.5 h-5 w-5" />
    </div>
  )
}

function CalendarSuggestionItem({ item, onCreate }: { item: ConexaSuggestion; onCreate: (s: ConexaSuggestion) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCreate(item)}
      title={`Sugerida por Conexa: ${item.titulo}. Click para crear.`}
      className="flex w-full min-w-0 items-center gap-1.5 rounded-md border border-dashed border-[var(--tasks-cx-border)] bg-[var(--tasks-cx-bg)] px-1.5 py-1 text-left text-[11.5px] hover:border-[var(--tasks-cx-btn)]"
    >
      <span className="shrink-0 text-[var(--tasks-cx-label)]" aria-hidden="true">
        ✦
      </span>
      <span className="truncate font-semibold text-[var(--tasks-cx-text)]">{item.titulo}</span>
    </button>
  )
}

interface CalendarViewProps {
  suggestions: ConexaSuggestion[]
  onCreateSuggestion: (s: ConexaSuggestion) => void
  onShowNoDate: () => void
}

export function CalendarView({ suggestions, onCreateSuggestion, onShowNoDate }: CalendarViewProps) {
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const tasks = useFilteredTasks()
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [newTaskDate, setNewTaskDate] = useState<Date | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [maxItems, setMaxItems] = useState(DEFAULT_MAX_ITEMS)

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const rowHeight = entry.contentRect.height / WEEKS
      // Cell padding + day header + room for the "+N más" button.
      const available = rowHeight - CELL_CHROME_HEIGHT - MORE_BUTTON_HEIGHT
      setMaxItems(Math.max(1, Math.floor(available / ITEM_HEIGHT)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const days = useMemo(() => Array.from({ length: WEEKS * 7 }, (_, i) => addDays(anchor, i)), [anchor])
  const titleMonth = addDays(anchor, 14)
  const noDateCount = useMemo(() => tasks.filter((t) => !t.dueDate).length, [tasks])

  const itemsByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    const push = (d: Date, item: DayItem) => {
      const key = format(d, 'yyyy-MM-dd')
      map.set(key, [...(map.get(key) ?? []), item])
    }
    for (const task of tasks) {
      const due = toDate(task.dueDate)
      if (due) push(due, { kind: 'task', task })
    }
    for (const s of suggestions) {
      if (s.fecha_vencimiento) push(new Date(`${s.fecha_vencimiento}T12:00:00`), { kind: 'suggestion', item: s })
    }
    for (const [key, list] of map) {
      map.set(
        key,
        list.sort((a, b) => {
          const ra = a.kind === 'task' ? (isOpenTask(a.task) ? 0 : 2) : 1
          const rb = b.kind === 'task' ? (isOpenTask(b.task) ? 0 : 2) : 1
          return ra - rb
        }),
      )
    }
    return map
  }, [tasks, suggestions])

  const renderItem = (it: DayItem) =>
    it.kind === 'task' ? (
      <CalendarTaskItem key={it.task.id} task={it.task} onOpen={setSelectedTask} />
    ) : (
      <CalendarSuggestionItem key={`s-${it.item.id}`} item={it.item} onCreate={onCreateSuggestion} />
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <h2 className="text-[15px] font-bold capitalize text-[var(--tasks-text)]">
          {format(titleMonth, 'MMMM yyyy', { locale: es })}
        </h2>
        <button
          type="button"
          onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="h-[30px] rounded-lg border border-[var(--tasks-border)] bg-[var(--tasks-card)] px-3 text-[12.5px] font-semibold text-[var(--tasks-text)] hover:border-[var(--tasks-border-hover)]"
        >
          Hoy
        </button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setAnchor((a) => addWeeks(a, -WEEKS))}
            aria-label="Semanas anteriores"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[var(--tasks-text-2)] hover:bg-[var(--tasks-count)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => addWeeks(a, WEEKS))}
            aria-label="Semanas siguientes"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[var(--tasks-text-2)] hover:bg-[var(--tasks-count)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {noDateCount > 0 && (
          <button
            type="button"
            onClick={onShowNoDate}
            className="ml-auto text-[12.5px] font-semibold text-[var(--tasks-text-3)] hover:text-[var(--tasks-text)] hover:underline"
          >
            Sin fecha: {noDateCount}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-4">
        <div className="flex min-h-full min-w-[560px] flex-1 flex-col overflow-hidden rounded-[14px] border border-[var(--tasks-border)] bg-[var(--tasks-card)] md:min-w-0">
          <div className="grid shrink-0 grid-cols-7 border-b border-[var(--tasks-border)] bg-[var(--tasks-col)]">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--tasks-text-3)]">
                {d}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            className="grid min-h-0 flex-1 grid-cols-7"
            style={{ gridTemplateRows: `repeat(${WEEKS}, minmax(${MIN_ROW_HEIGHT}px, 1fr))` }}
          >
            {days.map((day, i) => {
              const key = format(day, 'yyyy-MM-dd')
              const items = itemsByDay.get(key) ?? []
              const openCount = items.filter((it) => it.kind === 'task' && isOpenTask(it.task)).length
              const today = isToday(day)
              const otherMonth = !isSameMonth(day, titleMonth)
              const visible = items.length <= maxItems + 1 ? items : items.slice(0, maxItems)
              const hidden = items.length - visible.length
              return (
                <div
                  key={key}
                  className={cn(
                    'group/day flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden border-[var(--tasks-border-soft)] p-1.5',
                    i % 7 !== 6 && 'border-r',
                    i < days.length - 7 && 'border-b',
                    otherMonth && 'bg-[var(--tasks-col)]',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold',
                        today
                          ? 'bg-[var(--tasks-brand)] font-bold text-[var(--tasks-on-brand)]'
                          : otherMonth
                            ? 'text-[var(--tasks-text-3)]'
                            : 'text-[var(--tasks-text)]',
                      )}
                      aria-current={today ? 'date' : undefined}
                    >
                      {format(day, 'd')}
                    </span>
                    {openCount >= 2 && (
                      <span className="truncate text-[10.5px] font-semibold text-[var(--tasks-media-fg)]">{openCount} abiertas</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setNewTaskDate(day)}
                      aria-label={`Crear tarea el ${format(day, "d 'de' MMMM", { locale: es })}`}
                      className="ml-auto flex h-5 w-5 items-center justify-center rounded text-[var(--tasks-text-3)] opacity-0 hover:bg-[var(--tasks-count)] focus-visible:opacity-100 group-hover/day:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {visible.map(renderItem)}
                  {hidden > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-[var(--tasks-text-3)] hover:bg-[var(--tasks-count)] hover:text-[var(--tasks-text)]"
                        >
                          +{hidden} más
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-2" align="start">
                        <p className="px-1 pb-2 text-[12.5px] font-bold capitalize">
                          {format(day, "EEEE d 'de' MMMM", { locale: es })}
                        </p>
                        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">{items.map(renderItem)}</div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <NewTaskModal
        open={newTaskDate !== null}
        onOpenChange={(open) => !open && setNewTaskDate(null)}
        initialDueDate={newTaskDate}
      />
    </div>
  )
}
