'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { NewTaskPrefill } from './new-task-modal'
import dynamic from 'next/dynamic'
import type { TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useTaskStore, useTaskStoreHydrated, useFilteredTasks, STATUS_CONFIG } from '@/lib/tasks/task-store'

// Lazy load heavy components
const KanbanView = dynamic(() => import('./kanban-view').then(m => ({ default: m.KanbanView })), {
  loading: () => <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Cargando...</div></div>
})
const ListView = dynamic(() => import('./list-view').then(m => ({ default: m.ListView })), {
  loading: () => <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Cargando...</div></div>
})
const CalendarView = dynamic(() => import('./calendar-view').then(m => ({ default: m.CalendarView })), {
  loading: () => <div className="flex items-center justify-center h-64"><div className="animate-pulse text-muted-foreground">Cargando...</div></div>
})
const TaskDetailPanel = dynamic(() => import('./task-detail-panel').then(m => ({ default: m.TaskDetailPanel })))
const NewTaskModal = dynamic(() => import('./new-task-modal').then(m => ({ default: m.NewTaskModal })))
const ScheduleMeetingModal = dynamic(() => import('./schedule-meeting-modal').then(m => ({ default: m.ScheduleMeetingModal })))
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Calendar, Search, MoreHorizontal, Download } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useConexaSuggestions, type ConexaSuggestion } from '@/hooks/use-conexa-suggestions'
import { ConexaStrip } from './conexa-strip'
import { TasksEmptyState, getTaskClients, getTaskPeople, getTypeLabel, toDate } from './view-parts'
import type { Task } from '@/lib/types'
import { ClientFilter } from './client-filter'
import { CreatedDateFilter } from './created-date-filter'
import { ActiveFilterChips, AssigneeFilter, FiltersPopover, StatusFilter, useFiltersUrlSync } from './filters-popover'
import { preloadTaskDetailPanel } from '@/lib/tasks/prefetch-task'

const VIEWS = [
  { id: 'kanban', label: 'Tablero' },
  { id: 'list', label: 'Lista' },
  { id: 'calendar', label: 'Calendario' },
] as const

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function exportCsv(tasks: Task[]) {
  const header = ['Tarea', 'Cliente', 'Tipo', 'Estado', 'Prioridad', 'Responsables', 'Vence', 'Creada', 'Tiempo (min)']
  const rows = tasks.map((t) => [
    t.title,
    getTaskClients(t).map((c) => c.name).join(' + '),
    getTypeLabel(t) ?? '',
    STATUS_CONFIG[t.status]?.label ?? t.status,
    t.priority,
    getTaskPeople(t).map((p) => p.nombre).join(', '),
    toDate(t.dueDate)?.toISOString().slice(0, 10) ?? '',
    toDate(t.createdAt)?.toISOString().slice(0, 10) ?? '',
    Math.round(t.totalTimeSec / 60),
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `tareas-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function TaskBoard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const hydrated = useTaskStoreHydrated()
  const { 
    view, 
    setView, 
    filters, 
    setFilter, 
    clearFilters,
    advancedFilters,
    setAdvancedFilters,
    savedFilters,
    saveFilter,
    loadSavedFilter,
    deleteSavedFilter,
    loadSavedFilters,
    loadTasks,
    isLoading,
    setSelectedTask,
  } = useTaskStore()
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newTaskMode, setNewTaskMode] = useState<'manual' | 'ai'>('manual')
  const [meetingOpen, setMeetingOpen] = useState(false)
  const [prefill, setPrefill] = useState<NewTaskPrefill | null>(null)
  const [seguimientoItemId, setSeguimientoItemId] = useState<string | null>(null)
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null)
  const [returnToSeguimiento, setReturnToSeguimiento] = useState(false)
  const filteredTasks = useFilteredTasks()
  const allTaskCount = useTaskStore((s) => s.tasks.length)
  const { items: suggestions, dismiss: dismissSuggestion, refresh: refreshSuggestions } = useConexaSuggestions()

  const createFromSuggestion = (s: ConexaSuggestion) => {
    setPrefill({
      title: s.titulo,
      clientIds: s.cliente_id ? [s.cliente_id] : [],
      assigneeIds: [],
      priority: s.prioridad ?? '',
      dueDate: s.fecha_vencimiento ?? '',
      description: (s.detalles ?? []).join('\n'),
    })
    setSeguimientoItemId(s.id)
    setReturnToSeguimiento(false)
    setNewTaskMode('manual')
    setNewTaskOpen(true)
  }

  const showSuggestions = () => {
    setView('kanban')
    setTimeout(() => document.getElementById('conexa-suggestions')?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }), 50)
  }

  const handleNewTaskOpenChange = (open: boolean) => {
    setNewTaskOpen(open)
    if (!open) {
      setPrefill(null)
      setSeguimientoItemId(null)
      setNewTaskStatus(null)
      setReturnToSeguimiento(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      setNewTaskMode('manual')
      setNewTaskOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleTaskCreated = async (taskId: string) => {
    if (!seguimientoItemId) return
    await fetch(`/api/tasks/seguimiento/${seguimientoItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tarea_id: taskId, match_estado: 'vinculada' }),
    }).catch(() => {})
    if (returnToSeguimiento) router.push('/dashboard/seguimiento')
    else refreshSuggestions()
  }
  
  // Track if seguimiento was already generated this session
  const seguimientoGenerated = useRef(false)
  
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => { preloadTaskDetailPanel() })
      return () => window.cancelIdleCallback(id)
    }
    const timeout = setTimeout(() => { preloadTaskDetailPanel() }, 1500)
    return () => clearTimeout(timeout)
  }, [])

  const [tasksLoaded, setTasksLoaded] = useState(false)
  const lastOpenedTaskParam = useRef<string | null>(null)

  // Load all tasks once on mount. Filters are mirrored into the URL, so depending on
  // searchParams here used to re-download every task on each filter click.
  useEffect(() => {
    const initTasks = async () => {
      await loadTasks()
      setTasksLoaded(true)
      loadSavedFilters()

      // Regenerate seguimiento once per browser session, not on every visit to the board.
      // DELETE must finish before POST, otherwise the two requests race on the same rows.
      const SEGUIMIENTO_KEY = 'mdk-seguimiento-generated'
      if (!seguimientoGenerated.current && !sessionStorage.getItem(SEGUIMIENTO_KEY)) {
        seguimientoGenerated.current = true
        sessionStorage.setItem(SEGUIMIENTO_KEY, '1')
        fetch('/api/tasks/generate-seguimiento', { method: 'DELETE' })
          .then(() => fetch('/api/tasks/generate-seguimiento', { method: 'POST' }))
          .catch(() => {})
      }
    }
    initTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL-driven actions (notification links, "Crear tarea" from seguimiento) once tasks are in memory.
  useEffect(() => {
    if (!tasksLoaded) return
    {
      const taskId = searchParams.get('task')
      if (taskId && taskId !== lastOpenedTaskParam.current) {
        setSelectedTask(taskId)
      }
      lastOpenedTaskParam.current = taskId

      // "Crear tarea" from /dashboard/seguimiento opens the modal pre-filled
      if (searchParams.get('new') === '1') {
        const prioridad = searchParams.get('prioridad')
        setPrefill({
          title: searchParams.get('titulo') ?? '',
          clientIds: searchParams.get('cliente_id') ? [searchParams.get('cliente_id')!] : [],
          assigneeIds: searchParams.get('asignado_a') ? [searchParams.get('asignado_a')!] : [],
          priority: prioridad === 'alta' || prioridad === 'media' || prioridad === 'baja' ? prioridad : '',
          dueDate: searchParams.get('fecha_vencimiento') ?? '',
          description: searchParams.get('descripcion') ?? '',
        })
        setSeguimientoItemId(searchParams.get('seguimiento_item'))
        setReturnToSeguimiento(true)
        setNewTaskMode('manual')
        setNewTaskOpen(true)
        router.replace('/dashboard/tasks')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tasksLoaded])

  // The advanced filter builder was replaced by the client selector; drop any persisted
  // advanced rules so they can't keep hiding tasks without a visible control.
  useEffect(() => {
    if (!hydrated) return
    const state = useTaskStore.getState()
    if (state.advancedFilters.length > 0) setAdvancedFilters([])
    // The Tipo filter was removed from the toolbar; clear any persisted value for the same reason.
    if (state.filters.type) setFilter('type', null)
  }, [hydrated, setAdvancedFilters, setFilter])

  // Live updates: any insert/update/delete in `tareas` (from any user) refreshes the board.
  // Debounced because bulk operations (e.g. seguimiento generation) fire many events at once.
  useEffect(() => {
    // Unique name per mount: reusing a fixed name returns the still-subscribed channel
    // on fast remounts, and calling .on() on it throws and crashes the section.
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof supabase.channel> | null = null
    const changedIds = new Set<string>()
    const deletedIds = new Set<string>()
    try {
      channel = supabase
        .channel(`task-board-tareas-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string })?.id
            if (id) { deletedIds.add(id); changedIds.delete(id) }
          } else {
            const id = (payload.new as { id?: string })?.id
            if (id) changedIds.add(id)
          }
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            const changed = [...changedIds]
            const deleted = [...deletedIds]
            changedIds.clear()
            deletedIds.clear()
            useTaskStore.getState().syncTasksByIds(changed, deleted).catch((err) => {
              console.error('Realtime task sync failed:', err)
            })
          }, 400)
        })
        .subscribe()
    } catch (err) {
      console.error('Realtime subscription failed:', err)
    }

    return () => {
      if (timer) clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  useFiltersUrlSync(hydrated)

  const hasSimpleFilters = filters.priority || (filters.statusIds?.length ?? 0) > 0 || filters.assigneeIds.length > 0 || filters.dueThisWeek || filters.searchQuery || filters.showUnassigned || (filters.clientIds?.length ?? 0) > 0 || Boolean(filters.createdFrom || filters.createdTo)
  const hasAdvancedFilters = advancedFilters.length > 0
  const hasFilters = Boolean(hasSimpleFilters || hasAdvancedFilters || filters.dueFilter)
  const showEmpty = !isLoading && filteredTasks.length === 0 && (hasFilters || allTaskCount === 0) && suggestions.length === 0
  const clearAll = () => {
    clearFilters()
    setAdvancedFilters([])
  }

  // Don't render until hydrated from localStorage
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Cargando filtros...</div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-full flex-col bg-[var(--tasks-bg)]">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--tasks-border)] px-4 py-3">
        <button
          type="button"
          onClick={() => { setNewTaskMode('manual'); setNewTaskOpen(true) }}
          className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-[var(--tasks-brand)] px-4 text-[13px] font-bold text-[var(--tasks-on-brand)] hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva tarea
        </button>

        <StatusFilter />
        <AssigneeFilter />
        <ClientFilter />
        <CreatedDateFilter />
        <FiltersPopover />
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="h-[30px] shrink-0 rounded-lg px-2 text-[12.5px] font-semibold text-[var(--tasks-text-3)] hover:text-[var(--tasks-text)]"
          >
            Limpiar
          </button>
        )}

        <div className="min-w-4 flex-1" />

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--tasks-text-3)]" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar tareas"
            placeholder="Buscar tareas"
            value={filters.searchQuery}
            onChange={(e) => setFilter('searchQuery', e.target.value)}
            className="h-[30px] w-[180px] rounded-lg border border-[var(--tasks-border)] bg-[var(--tasks-card)] pl-8 pr-2.5 text-[12.5px] text-[var(--tasks-text)] placeholder:text-[var(--tasks-text-3)] focus:border-[var(--tasks-brand)] focus:outline-none"
          />
        </div>

        <div role="tablist" aria-label="Vista" className="flex shrink-0 items-center rounded-lg border border-[var(--tasks-border)] bg-[var(--tasks-col)] p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'h-[26px] rounded-md px-2.5 text-[12.5px] font-semibold transition-colors',
                view === v.id
                  ? 'bg-[var(--tasks-card)] text-[var(--tasks-text)] shadow-sm'
                  : 'text-[var(--tasks-text-3)] hover:text-[var(--tasks-text)]',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Más acciones"
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[var(--tasks-border)] bg-[var(--tasks-card)] text-[var(--tasks-text-2)] hover:border-[var(--tasks-border-hover)]"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setMeetingOpen(true)}>
              <Calendar className="mr-2 h-4 w-4" />
              Agendar reunión
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportCsv(filteredTasks)}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConexaStrip suggestionCount={suggestions.length} onShowSuggestions={showSuggestions} />
      <ActiveFilterChips />

      <div className="min-h-0 flex-1 overflow-hidden">
        {showEmpty ? (
          <TasksEmptyState
            hasFilters={hasFilters}
            onClearFilters={clearAll}
            onNewTask={() => { setNewTaskMode('manual'); setNewTaskOpen(true) }}
          />
        ) : (
          <>
            {view === 'kanban' && (
              <KanbanView
                onAddTask={(status) => {
                  setNewTaskStatus(status)
                  setNewTaskMode('manual')
                  setNewTaskOpen(true)
                }}
                suggestions={suggestions}
                onCreateSuggestion={createFromSuggestion}
                onDismissSuggestion={dismissSuggestion}
              />
            )}
            {view === 'list' && (
              <ListView suggestions={suggestions} onCreateSuggestion={createFromSuggestion} onDismissSuggestion={dismissSuggestion} />
            )}
            {view === 'calendar' && (
              <CalendarView
                suggestions={suggestions}
                onCreateSuggestion={createFromSuggestion}
                onShowNoDate={() => { setFilter('dueFilter', 'none'); setView('list') }}
              />
            )}
          </>
        )}
      </div>

      <TaskDetailPanel />

      <NewTaskModal
        open={newTaskOpen}
        onOpenChange={handleNewTaskOpenChange}
        initialMode={newTaskMode}
        initialValues={prefill}
        initialStatus={newTaskStatus}
        onCreated={handleTaskCreated}
      />
      <ScheduleMeetingModal open={meetingOpen} onOpenChange={setMeetingOpen} />
    </div>
    </TooltipProvider>
  )
}
