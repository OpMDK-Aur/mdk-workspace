'use client'

import { useState } from 'react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/lib/tasks/task-store'
import { Input } from '@/components/ui/input'
import { CircleCheck, Paperclip } from 'lucide-react'
import {
  ClientSquares,
  PeopleStack,
  PriorityPill,
  TypeChip,
  formatCreated,
  formatDuration,
  getDueInfo,
  getRiskNote,
  getTaskClients,
  getTaskPeople,
  getTypeLabel,
  stripClientFromTitle,
  useLiveTime,
} from './view-parts'

interface TaskCardProps {
  task: Task
  onClick: () => void
  subtasks?: { done: number; total: number }
}

export function TaskCard({ task, onClick, subtasks }: TaskCardProps) {
  const liveTime = useLiveTime(task)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [tempTitle, setTempTitle] = useState(task.title)
  const updateTask = useTaskStore((s) => s.updateTask)

  const clients = getTaskClients(task)
  const due = getDueInfo(task)
  const risk = getRiskNote(task)
  const created = formatCreated(task)
  const isResuelto = task.status === 'resuelto'
  const fileCount = task.files?.length ?? 0

  const handleStartEditTitle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTempTitle(task.title)
    setIsEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    if (tempTitle.trim() && tempTitle !== task.title) {
      await updateTask(task.id, { title: tempTitle.trim() })
    }
    setIsEditingTitle(false)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'group flex w-full min-w-0 cursor-pointer flex-col gap-2 overflow-hidden rounded-xl border p-3 text-left transition-colors',
        'border-[var(--tasks-border)] bg-[var(--tasks-card)] hover:border-[var(--tasks-border-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tasks-brand)]/50',
        isResuelto && 'opacity-[.62]',
      )}
    >
      <ClientSquares clients={clients} conexa={Boolean(task.isSystemTask)} />

      <div className="flex min-w-0">
        <TypeChip label={getTypeLabel(task)} />
      </div>

      {isEditingTitle ? (
        <Input
          value={tempTitle}
          onChange={(e) => setTempTitle(e.target.value)}
          onBlur={handleSaveTitle}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') handleSaveTitle()
            if (e.key === 'Escape') setIsEditingTitle(false)
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-7 text-sm"
          autoFocus
        />
      ) : (
        <h4
          className="line-clamp-3 cursor-text break-words text-[13.5px] font-semibold leading-[1.35] text-[var(--tasks-text)] [text-wrap:pretty]"
          onClick={handleStartEditTitle}
        >
          {stripClientFromTitle(task.title, clients)}
        </h4>
      )}

      {risk && (
        <p className="rounded-lg bg-[var(--tasks-cx-bg)] px-2 py-[5px] text-[11.5px] leading-4 text-[var(--tasks-cx-text)]">
          ✦ {risk}
        </p>
      )}

      <div className="flex min-w-0 items-center gap-2">
        <PriorityPill priority={task.priority} />
        {due && (
          <span
            className={cn(
              'truncate text-[11.5px] font-semibold',
              due.tone === 'overdue' ? 'text-[var(--tasks-overdue)]' : 'text-[var(--tasks-text-3)]',
            )}
          >
            {due.text}
          </span>
        )}
        <span className="flex-1" />
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--tasks-text-3)]">
          {fileCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Adjuntos:</span>
              {fileCount}
            </span>
          )}
          {subtasks && subtasks.total > 0 && (
            <span className="flex items-center gap-0.5 tabular-nums">
              <CircleCheck className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Subtareas completadas:</span>
              {subtasks.done}/{subtasks.total}
            </span>
          )}
          {liveTime > 0 && (
            <span className="flex items-center gap-1 font-mono tabular-nums">
              {task.isTimerRunning && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--tasks-baja-fg)]" aria-label="Timer en curso" />
              )}
              {formatDuration(liveTime)}
            </span>
          )}
        </div>
        <PeopleStack people={getTaskPeople(task)} />
      </div>

      {created && (
        <p className="truncate text-[11px] text-[var(--tasks-text-3)]">
          Creada {created}
          {task.createdByName ? ` · ${task.createdByName}` : ''}
        </p>
      )}
    </div>
  )
}
