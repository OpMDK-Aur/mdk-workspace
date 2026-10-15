'use client'

import { differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarIcon, Copy, Link2, MoreHorizontal, Trash2 } from 'lucide-react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/lib/tasks/task-store'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function relativeDue(due: Date, done: boolean): { label: string; overdue: boolean } | null {
  if (done) return null
  const diff = differenceInCalendarDays(due, new Date())
  if (diff === 0) return { label: 'vence hoy', overdue: false }
  if (diff === 1) return { label: 'vence mañana', overdue: false }
  if (diff > 1) return { label: `vence en ${diff} días`, overdue: false }
  const ago = Math.abs(diff)
  return { label: `vencida hace ${ago} ${ago === 1 ? 'día' : 'días'}`, overdue: true }
}

function DateChip({
  label,
  value,
  onSelect,
  disabledBefore,
  tone,
}: {
  label: string
  value: Date | null
  onSelect: (d: Date | null) => void
  disabledBefore?: Date | null
  tone?: 'warn'
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-7 inline-flex items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap transition-colors hover:bg-[var(--ntm-field)]',
            value ? 'text-[var(--ntm-text)]' : 'text-[var(--ntm-text-3)]',
            tone === 'warn' && 'text-[var(--ntm-warn)]',
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          <span className="text-[var(--ntm-text-3)]">{label}</span>
          {value ? format(value, 'd MMM yyyy', { locale: es }) : 'Sin fecha'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => onSelect(d ?? null)}
          disabled={disabledBefore ? { before: disabledBefore } : undefined}
          initialFocus
        />
        {value && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onSelect(null)}>
              Quitar fecha
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function TaskDatesField({
  task,
  onChange,
}: {
  task: Task
  onChange: (patch: Partial<Pick<Task, 'startDate' | 'dueDate'>>) => void
}) {
  const done = task.status === 'resuelto' || task.status === 'no_realizado'
  const rel = task.dueDate ? relativeDue(task.dueDate, done) : null

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 min-w-0">
      <DateChip label="Inicio" value={task.startDate} onSelect={(d) => onChange({ startDate: d })} />
      <span className="text-[var(--ntm-text-3)]" aria-hidden="true">→</span>
      <DateChip
        label="Vence"
        value={task.dueDate}
        onSelect={(d) => onChange({ dueDate: d })}
        disabledBefore={task.startDate}
        tone={rel?.overdue ? 'warn' : undefined}
      />
      {rel && (
        <span className={cn('text-xs px-1', rel.overdue ? 'text-[var(--ntm-warn)] font-medium' : 'text-[var(--ntm-text-3)]')}>
          {rel.label}
        </span>
      )}
    </div>
  )
}

export function OtherTimerNotice() {
  const runningTaskId = useTimerStore((s) => s.taskId)
  const description = useTimerStore((s) => s.description)
  const runningTitle = useTaskStore((s) =>
    runningTaskId ? s.tasks.find((t) => t.id === runningTaskId)?.title : undefined,
  )
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const label = runningTitle || description || 'otra tarea'

  return (
    <p className="ml-1 min-w-0 text-xs text-[var(--ntm-text-2)] text-pretty">
      {'Tenés un timer corriendo en '}
      <span className="font-medium text-[var(--ntm-text)]">{label}</span>
      {'. Si iniciás este, se pausa. '}
      {runningTaskId && (
        <button
          type="button"
          onClick={() => setSelectedTask(runningTaskId)}
          className="font-medium underline underline-offset-2 text-[var(--ntm-text)] hover:no-underline"
        >
          Ver
        </button>
      )}
    </p>
  )
}

export function TaskMoreMenu({
  onDuplicate,
  onCopyLink,
  onDelete,
}: {
  onDuplicate: () => void
  onCopyLink: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Más acciones">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyLink}>
          <Link2 className="h-4 w-4" />
          Copiar link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" />
          Eliminar tarea
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
