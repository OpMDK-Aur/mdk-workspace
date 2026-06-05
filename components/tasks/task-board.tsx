'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { TaskPriority, TaskType, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, useTaskStoreHydrated, PRIORITY_CONFIG, TYPE_CONFIG, ASSIGNEES, STATUS_CONFIG, STATUS_ORDER } from '@/lib/tasks/task-store'

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
const FilterBuilder = dynamic(() => import('./filter-builder').then(m => ({ default: m.FilterBuilder })))
const ScheduleMeetingModal = dynamic(() => import('./schedule-meeting-modal').then(m => ({ default: m.ScheduleMeetingModal })))
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  LayoutGrid,
  List,
  Calendar,
  ChevronDown,
  X,
  Search,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

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
  
  // Track if seguimiento was already generated this session
  const seguimientoGenerated = useRef(false)
  
  // Generate seguimiento tasks for MDK clients on mount, then load all tasks
  useEffect(() => {
    const initTasks = async () => {
      // Load tasks and wait for them to be ready
      await loadTasks()
      
      // Load saved filters from database
      loadSavedFilters()
      
      // Open task from URL parameter (e.g., from notification click) AFTER tasks are loaded
      const taskId = searchParams.get('task')
      if (taskId) {
        setSelectedTask(taskId)
      }
      
      // Only generate seguimiento once per session (non-blocking)
      if (!seguimientoGenerated.current) {
        seguimientoGenerated.current = true
        Promise.all([
          fetch('/api/tasks/generate-seguimiento', { method: 'DELETE' }),
          fetch('/api/tasks/generate-seguimiento', { method: 'POST' })
        ]).catch(() => {}) // Silently fail
      }
    }
    initTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const hasSimpleFilters = filters.priority || filters.status || filters.assigneeIds.length > 0 || filters.type || filters.dueThisWeek || filters.searchQuery || filters.showUnassigned
  const hasAdvancedFilters = advancedFilters.length > 0
  const hasFilters = hasSimpleFilters || hasAdvancedFilters

  // Don't render until hydrated from localStorage
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Cargando filtros...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-4 border-b bg-card overflow-x-auto">
        {/* Actions */}
        <Button className="gap-1.5 shrink-0" onClick={() => { setNewTaskMode('manual'); setNewTaskOpen(true) }}>
          <Plus className="h-4 w-4" />
          Nueva tarea
        </Button>
        <Button variant="outline" className="gap-1.5 shrink-0" onClick={() => setMeetingOpen(true)}>
          <Calendar className="h-4 w-4" />
          Agendar reunion
        </Button>

        {/* Filters */}
        <FilterBuilder
          filters={advancedFilters}
          savedFilters={savedFilters}
          onChange={setAdvancedFilters}
          onSaveFilter={saveFilter}
          onLoadFilter={loadSavedFilter}
          onDeleteSavedFilter={deleteSavedFilter}
        />

        <Badge
          variant="outline"
          className={cn(
            'cursor-pointer px-2.5 py-1 h-7 shrink-0',
            !hasFilters && 'bg-primary/10 text-primary border-primary/30'
          )}
          onClick={clearFilters}
        >
          Todas
        </Badge>

        {/* Priority filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'cursor-pointer px-2.5 py-1 h-7 gap-1 shrink-0',
                filters.priority && 'bg-red-500/10 text-red-400 border-red-500/30'
              )}
            >
              Prioridad
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(['alta', 'media', 'baja'] as TaskPriority[]).map((p) => (
              <DropdownMenuCheckboxItem
                key={p}
                checked={filters.priority === p}
                onCheckedChange={(checked) => setFilter('priority', checked ? p : null)}
              >
                <Badge variant="outline" className={cn('text-xs border-0', PRIORITY_CONFIG[p].bgColor, PRIORITY_CONFIG[p].color)}>
                  {PRIORITY_CONFIG[p].label}
                </Badge>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'cursor-pointer px-2.5 py-1 h-7 gap-1 shrink-0',
                filters.status && 'bg-purple-500/10 text-purple-400 border-purple-500/30'
              )}
            >
              {filters.status ? STATUS_CONFIG[filters.status].label : 'Estado'}
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {STATUS_ORDER.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={filters.status === s}
                onCheckedChange={(checked) => setFilter('status', checked ? s : null)}
              >
                <Badge variant="outline" className={cn('text-xs border-0', STATUS_CONFIG[s].bgColor, STATUS_CONFIG[s].color)}>
                  {STATUS_CONFIG[s].label}
                </Badge>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assignee filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'cursor-pointer px-2.5 py-1 h-7 gap-1 shrink-0',
                (filters.assigneeIds.length > 0 || filters.showUnassigned) && 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              )}
            >
              {filters.showUnassigned
                ? 'Sin asignar'
                : filters.assigneeIds.length === 0
                ? 'Asignado'
                : filters.assigneeIds.length === 1
                ? ASSIGNEES.find((a) => a.id === filters.assigneeIds[0])?.name ?? 'Asignado'
                : `${filters.assigneeIds.length} asignados`}
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => {
                setFilter('assigneeIds', [])
                setFilter('showUnassigned', false)
              }}
              className={cn(
                !filters.showUnassigned && filters.assigneeIds.length === 0 && 'bg-muted'
              )}
            >
              Todos
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={filters.showUnassigned === true}
              onCheckedChange={(checked) => {
                setFilter('showUnassigned', checked)
                if (checked) setFilter('assigneeIds', [])
              }}
            >
              Sin asignar
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {ASSIGNEES.map((a) => (
              <DropdownMenuCheckboxItem
                key={a.id}
                checked={filters.assigneeIds.includes(a.id)}
                onCheckedChange={(checked) => {
                  setFilter('showUnassigned', false)
                  const newIds = checked
                    ? [...filters.assigneeIds, a.id]
                    : filters.assigneeIds.filter(id => id !== a.id)
                  setFilter('assigneeIds', newIds)
                }}
              >
                {a.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Type filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'cursor-pointer px-2.5 py-1 h-7 gap-1 shrink-0',
                filters.type && 'bg-violet-500/10 text-violet-400 border-violet-500/30'
              )}
            >
              {filters.type ? TYPE_CONFIG[filters.type].label : 'Tipo'}
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(Object.keys(TYPE_CONFIG) as TaskType[]).map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={filters.type === t}
                onCheckedChange={(checked) => setFilter('type', checked ? t : null)}
              >
                <Badge variant="outline" className={cn('text-xs border-0', TYPE_CONFIG[t].color)}>
                  {TYPE_CONFIG[t].label}
                </Badge>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFilters && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1 min-w-4" />

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar tareas..."
            value={filters.searchQuery}
            onChange={(e) => setFilter('searchQuery', e.target.value)}
            className="pl-9 w-[150px] h-8"
          />
        </div>

        {/* View Toggle */}
        <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-md',
              view === 'kanban' && 'bg-background shadow-sm'
            )}
            onClick={() => setView('kanban')}
            title="Kanban"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-md',
              view === 'list' && 'bg-background shadow-sm'
            )}
            onClick={() => setView('list')}
            title="Lista"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-md',
              view === 'calendar' && 'bg-background shadow-sm'
            )}
            onClick={() => setView('calendar')}
            title="Calendario"
          >
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Board content */}
      <div className="flex-1 overflow-hidden">
        {view === 'kanban' && (
          <KanbanView onAddTask={() => setNewTaskOpen(true)} />
        )}
        {view === 'list' && (
          <div className="p-4 h-full overflow-auto">
            <ListView />
          </div>
        )}
        {view === 'calendar' && (
          <CalendarView />
        )}
      </div>

      {/* Detail panel */}
      <TaskDetailPanel />

      {/* New task modal */}
      <NewTaskModal open={newTaskOpen} onOpenChange={setNewTaskOpen} initialMode={newTaskMode} />
      <ScheduleMeetingModal open={meetingOpen} onOpenChange={setMeetingOpen} />
    </div>
  )
}
