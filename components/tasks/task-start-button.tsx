'use client'

import { useState, type MouseEvent, type PointerEvent } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/lib/tasks/task-store'
import { useTimerStore, TIMER_ACTIVE_ERROR } from '@/lib/time-tracking/timer-store'
import { formatMissingTimerFields, TimerValidationError } from '@/lib/time-tracking/validate-timer'

const stop = (e: MouseEvent | PointerEvent) => e.stopPropagation()

export function TaskStartButton({ task, className }: { task: Task; className?: string }) {
  const isRunning = useTimerStore((s) => s.isRunning)
  const runningTaskId = useTimerStore((s) => s.taskId)
  const [busy, setBusy] = useState(false)

  const isThisRunning = isRunning && runningTaskId === task.id
  const isOtherRunning = isRunning && !isThisRunning

  if (task.status === 'resuelto' && !isThisRunning) return null

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (busy) return
    const timer = useTimerStore.getState()

    if (isThisRunning) {
      setBusy(true)
      try {
        const durationSec = timer.getElapsedSeconds()
        const startedAt = timer.startedAt
        await timer.stopTimer()
        const current = useTaskStore.getState().tasks.find((t) => t.id === task.id) ?? task
        useTaskStore.getState().updateTask(task.id, {
          totalTimeSec: current.totalTimeSec + durationSec,
          timeSessions: [
            ...current.timeSessions,
            {
              id: `session-${Date.now()}`,
              startedAt: new Date(startedAt ?? Date.now() - durationSec * 1000),
              endedAt: new Date(),
              durationSec,
            },
          ],
        })
        toast.success('Tiempo guardado')
      } catch {
        toast.error('Error al guardar el tiempo')
      } finally {
        setBusy(false)
      }
      return
    }

    if (isOtherRunning) {
      toast.error('Ya hay un timer activo', { description: 'Detenelo antes de iniciar otra tarea.' })
      return
    }

    setBusy(true)
    try {
      await timer.startTimerForTask(task.id, task.title, task.clientId || null, task.type || task.typeName || null)
      toast.success('Timer iniciado', { description: task.title })
    } catch (error) {
      if (error instanceof Error && error.message === TIMER_ACTIVE_ERROR) {
        toast.error('Ya hay un timer activo', { description: 'Detenelo antes de iniciar otra tarea.' })
      } else if (error instanceof TimerValidationError) {
        toast.error(formatMissingTimerFields(error.missing), {
          description: 'Lo precargué en la barra del timer: completalo ahí y dale Play.',
        })
      } else {
        toast.error('Error al iniciar el timer')
      }
    } finally {
      setBusy(false)
    }
  }

  const label = isThisRunning ? `Parar timer de ${task.title}` : `Iniciar timer de ${task.title}`

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={stop}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={busy}
      aria-label={label}
      title={isOtherRunning ? 'Hay un timer activo en otra tarea' : isThisRunning ? 'Parar' : 'Iniciar'}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isThisRunning
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'text-[var(--tasks-text-3)] hover:bg-[var(--tasks-row-hover)] hover:text-[var(--tasks-text)]',
        isOtherRunning && 'opacity-50',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : isThisRunning ? (
        <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
      ) : (
        <Play className="h-3 w-3 fill-current" aria-hidden="true" />
      )}
    </button>
  )
}
