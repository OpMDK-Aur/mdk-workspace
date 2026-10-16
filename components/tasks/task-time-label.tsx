'use client'

import { cn } from '@/lib/utils'
import { useTaskTime } from '@/hooks/use-task-time'
import { formatDuration } from './view-parts'

const fmt = (sec: number) => (sec > 0 ? formatDuration(sec) : '—')

/** "Mío / Total" for a task. `part` renders a single value for table columns. */
export function TaskTimeLabel({
  taskId,
  part,
  className,
}: {
  taskId: string
  part?: 'mine' | 'total'
  className?: string
}) {
  const { mine, total, running } = useTaskTime(taskId)
  const dot = running ? (
    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--tasks-baja-fg)]" aria-label="Timer en curso" />
  ) : null

  if (part) {
    const value = part === 'mine' ? mine : total
    return (
      <span className={cn('flex items-center gap-1 font-mono tabular-nums', className)}>
        {part === 'mine' && dot}
        {fmt(value)}
      </span>
    )
  }

  if (mine === 0 && total === 0) return null

  return (
    <span
      className={cn('flex items-center gap-1 font-mono tabular-nums', className)}
      title={`Tu tiempo: ${fmt(mine)} · Total de la tarea: ${fmt(total)}`}
    >
      {dot}
      <span className="sr-only">Tu tiempo:</span>
      {fmt(mine)}
      <span aria-hidden="true" className="opacity-50">/</span>
      <span className="sr-only">Total de la tarea:</span>
      <span className="opacity-70">{fmt(total)}</span>
    </span>
  )
}
