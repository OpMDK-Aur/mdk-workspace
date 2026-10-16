'use client'

import { useMemo, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { addDays, format } from 'date-fns'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTaskStore, useFilteredTasks } from '@/lib/tasks/task-store'
import { isDueTomorrow, isOpenTask, isOverdue } from './view-parts'

const todayKey = () => format(new Date(), 'yyyy-MM-dd')
const storageKey = (userId: string) => `tasks-conexa-strip-hidden:${userId}`
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function useHiddenToday(userId: string | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? localStorage.getItem(storageKey(userId)) === todayKey() : true),
    () => true,
  )
}

export function ConexaStrip({ suggestionCount, onShowSuggestions }: { suggestionCount: number; onShowSuggestions: () => void }) {
  const tasks = useFilteredTasks()
  const setFilter = useTaskStore((s) => s.setFilter)
  const { data: userId } = useSWR('tasks-current-user-id', async () => {
    const { data } = await createClient().auth.getUser()
    return data.user?.id ?? 'anon'
  })
  const hidden = useHiddenToday(userId)

  const insights = useMemo(() => {
    const overdueInProgress = tasks.filter((t) => (t.status === 'resolviendo' || t.status === 'demorada') && isOverdue(t)).length
    const dueTomorrow = tasks.filter((t) => isOpenTask(t) && isDueTomorrow(t)).length
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    return [
      {
        key: 'overdue',
        count: overdueInProgress,
        label: `${overdueInProgress} ${overdueInProgress === 1 ? 'tarea vencida' : 'tareas vencidas'} en curso`,
        dot: 'var(--tasks-overdue)',
        apply: () => {
          setFilter('statusIds', ['resolviendo', 'demorada'])
          setFilter('dueFilter', 'overdue')
        },
      },
      {
        key: 'tomorrow',
        count: dueTomorrow,
        label: `${dueTomorrow} ${dueTomorrow === 1 ? 'vence' : 'vencen'} mañana`,
        dot: 'var(--tasks-media-fg)',
        apply: () => {
          setFilter('dueFilter', 'range')
          setFilter('dueFrom', tomorrow)
          setFilter('dueTo', tomorrow)
        },
      },
      {
        key: 'suggestions',
        count: suggestionCount,
        label: `${suggestionCount} ${suggestionCount === 1 ? 'sugerencia nueva' : 'sugerencias nuevas'}`,
        dot: 'var(--tasks-cx-btn)',
        apply: onShowSuggestions,
      },
    ].filter((i) => i.count > 0)
  }, [tasks, suggestionCount, setFilter, onShowSuggestions])

  if (hidden || insights.length === 0) return null

  const dismiss = () => {
    if (!userId) return
    localStorage.setItem(storageKey(userId), todayKey())
    listeners.forEach((l) => l())
  }

  return (
    <div className="flex h-[38px] shrink-0 items-center gap-4 overflow-x-auto border-b border-[var(--tasks-cx-border)] bg-[var(--tasks-cx-bg)] px-4 py-[9px] text-[12.5px]">
      <span className="shrink-0 font-bold text-[var(--tasks-cx-label)]">✦ Conexa</span>
      {insights.map((i) => (
        <button
          key={i.key}
          type="button"
          onClick={i.apply}
          className="flex shrink-0 items-center gap-1.5 font-medium text-[var(--tasks-cx-text)] hover:underline"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.dot }} aria-hidden="true" />
          {i.label}
        </button>
      ))}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ocultar sugerencias de Conexa por hoy"
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--tasks-cx-text)] hover:bg-[var(--tasks-cx-border)]/40"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
