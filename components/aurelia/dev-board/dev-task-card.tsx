'use client'

import { Bug, CalendarDays, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDay, type DevTask } from '@/lib/aurelia/followup-shared'

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')

export function CategoryPill({ categoria }: { categoria: DevTask['categoria'] }) {
  const isError = categoria === 'error'
  const Icon = isError ? Bug : Lightbulb
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', isError ? 'bg-[var(--tasks-alta-bg)] text-[var(--tasks-alta-fg)]' : 'bg-[var(--tasks-meet-bg)] text-[var(--tasks-meet-fg)]')}>
      <Icon className="size-3" aria-hidden="true" />
      {isError ? 'Error' : 'Sugerencia'}
    </span>
  )
}

export function DevTaskCard({ task, today, showCategory, onOpen }: { task: DevTask; today: string; showCategory: boolean; onOpen: () => void }) {
  const overdue = Boolean(task.fechaFin && task.fechaFin < today && task.etapa !== 'produccion')
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-[10px] border border-[var(--tasks-border)] bg-[var(--tasks-card)] p-3 text-left transition-colors hover:border-[var(--tasks-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tasks-brand)]"
    >
      {(showCategory || task.clientName) && (
        <div className="flex min-w-0 items-center gap-1.5">
          {showCategory && <CategoryPill categoria={task.categoria} />}
          {task.clientName && <span className="truncate text-[11.5px] font-medium text-[var(--tasks-text-3)]">{task.clientName}</span>}
        </div>
      )}
      <span className="line-clamp-3 text-[13px] font-semibold leading-snug text-[var(--tasks-text)]">{task.titulo}</span>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1 text-[11.5px] tabular-nums', overdue ? 'font-semibold text-[var(--tasks-overdue)]' : 'text-[var(--tasks-text-3)]')}>
          <CalendarDays className="size-3" aria-hidden="true" />
          {formatDay(task.fechaPedido, SHORT_DATE)}
          {task.fechaFin && <> → {formatDay(task.fechaFin, SHORT_DATE)}</>}
          {overdue && <span className="sr-only"> (vencida)</span>}
        </span>
        {task.asignadoName ? (
          <span title={`Asignada a ${task.asignadoName}`} className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--tasks-count)] text-[10px] font-bold text-[var(--tasks-text-2)]">
            {initials(task.asignadoName)}
            <span className="sr-only">Asignada a {task.asignadoName}</span>
          </span>
        ) : (
          <span className="text-[11px] text-[var(--tasks-text-3)]">Sin asignar</span>
        )}
      </div>
    </button>
  )
}
