'use client'

import { useMemo, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, ListFilter, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTaskStore, useFilteredTasks } from '@/lib/tasks/task-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isDueTomorrow, isOpenTask, isOverdue, toDate } from './view-parts'

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

  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const setView = useTaskStore((s) => s.setView)

  const insights = useMemo(() => {
    const overdueInProgress = tasks.filter((t) => (t.status === 'resolviendo' || t.status === 'demorada') && isOverdue(t))
    const dueTomorrow = tasks.filter((t) => isOpenTask(t) && isDueTomorrow(t))
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    const showInList = (apply: () => void) => () => {
      apply()
      setView('list')
    }
    return [
      {
        key: 'overdue',
        count: overdueInProgress.length,
        items: overdueInProgress,
        label: `${overdueInProgress.length} ${overdueInProgress.length === 1 ? 'tarea vencida' : 'tareas vencidas'} en curso`,
        dot: 'var(--tasks-overdue)',
        apply: showInList(() => {
          setFilter('statusIds', ['resolviendo', 'demorada'])
          setFilter('dueFilter', 'overdue')
        }),
      },
      {
        key: 'tomorrow',
        count: dueTomorrow.length,
        items: dueTomorrow,
        label: `${dueTomorrow.length} ${dueTomorrow.length === 1 ? 'vence' : 'vencen'} mañana`,
        dot: 'var(--tasks-media-fg)',
        apply: showInList(() => {
          setFilter('dueFilter', 'range')
          setFilter('dueFrom', tomorrow)
          setFilter('dueTo', tomorrow)
        }),
      },
      {
        key: 'suggestions',
        count: suggestionCount,
        items: null,
        label: `${suggestionCount} ${suggestionCount === 1 ? 'sugerencia nueva' : 'sugerencias nuevas'}`,
        dot: 'var(--tasks-cx-btn)',
        apply: onShowSuggestions,
      },
    ].filter((i) => i.count > 0)
  }, [tasks, suggestionCount, setFilter, setView, onShowSuggestions])

  if (hidden || insights.length === 0) return null

  const dismiss = () => {
    if (!userId) return
    localStorage.setItem(storageKey(userId), todayKey())
    listeners.forEach((l) => l())
  }

  return (
    <div className="flex h-[38px] shrink-0 items-center gap-4 overflow-x-auto border-b border-[var(--tasks-cx-border)] bg-[var(--tasks-cx-bg)] px-4 py-[9px] text-[12.5px]">
      <span className="shrink-0 font-bold text-[var(--tasks-cx-label)]">✦ Conexa</span>
      {insights.map((i) => {
        const trigger = (
          <button
            type="button"
            onClick={i.items ? undefined : i.apply}
            className="flex shrink-0 items-center gap-1.5 font-medium text-[var(--tasks-cx-text)] hover:underline"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.dot }} aria-hidden="true" />
            {i.label}
            {i.items && <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />}
          </button>
        )
        if (!i.items) return <span key={i.key} className="shrink-0">{trigger}</span>
        return (
          <DropdownMenu key={i.key}>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel className="text-xs text-muted-foreground">{i.label}</DropdownMenuLabel>
              {i.items.slice(0, 8).map((t) => {
                const due = toDate(t.dueDate)
                return (
                  <DropdownMenuItem key={t.id} onSelect={() => setSelectedTask(t.id)} className="flex items-center justify-between gap-3">
                    <span className="truncate">{t.title}</span>
                    {due && (
                      <span className="shrink-0 text-xs" style={{ color: i.dot }}>
                        {format(due, 'd MMM', { locale: es })}
                      </span>
                    )}
                  </DropdownMenuItem>
                )
              })}
              {i.items.length > 8 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">{`y ${i.items.length - 8} más`}</p>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={i.apply} className="gap-2 font-medium">
                <ListFilter className="h-3.5 w-3.5" />
                Ver en la lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
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
