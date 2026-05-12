'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { TaskPriority, TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, PRIORITY_CONFIG, TYPE_CONFIG, ASSIGNEES } from '@/lib/tasks/task-store'

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
  FileText,
  X,
  Search,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

export function TaskBoard() {
  const searchParams = useSearchParams()
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
  
  // Track if seguimiento was already generated this session
  const seguimientoGenerated = useRef(false)
  
  // Open task from URL parameter (e.g., from notification click)
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (taskId) {
      setSelectedTask(taskId)
    }
  }, [searchParams, setSelectedTask])
  
  // Generate seguimiento tasks for MDK clients on mount, then load all tasks
  useEffect(() => {
    const initTasks = async () => {
      // Load tasks 
      loadTasks()
      
      // Load saved filters from database
      loadSavedFilters()
      
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
  }, [])

  const hasSimpleFilters = filters.priority || filters.assigneeIds.length > 0 || filters.type || filters.dueThisWeek || filters.searchQuery || filters.showUnassigned
  const hasAdvancedFilters = advancedFilters.length > 0
  const hasFilters = hasSimpleFilters || hasAdvancedFilters

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          {/* New Task */}
          <Button className="gap-1.5" onClick={() => setNewTaskOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva tarea
          </Button>

          {/* View Toggle */}
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-3 rounded-md',
                view === 'kanban' && 'bg-background shadow-sm'
              )}
              onClick={() => setView('kanban')}
            >
              <LayoutGrid className="h-4 w-4 mr-1.5" />
              Kanban
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-3 rounded-md',
                view === 'list' && 'bg-background shadow-sm'
              )}
              onClick={() => setView('list')}
            >
              <List className="h-4 w-4 mr-1.5" />
              Lista
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-3 rounded-md',
                view === 'calendar' && 'bg-background shadow-sm'
              )}
              onClick={() => setView('calendar')}
            >
              <Calendar className="h-4 w-4 mr-1.5" />
              Calendario
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar tareas..."
              value={filters.searchQuery}
              onChange={(e) => setFilter('searchQuery', e.target.value)}
              className="pl-9 w-[200px] h-8"
            />
          </div>

          {/* Advanced Filter Builder */}
          <FilterBuilder
            filters={advancedFilters}
            savedFilters={savedFilters}
            onChange={setAdvancedFilters}
            onSaveFilter={saveFilter}
            onLoadFilter={loadSavedFilter}
            onDeleteSavedFilter={deleteSavedFilter}
          />

          {/* Quick filter chips */}
          <div className="flex items-center gap-1.5">
            {/* All tasks chip */}
            <Badge
              variant="outline"
              className={cn(
                'cursor-pointer px-2.5 py-1 h-7',
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
                    'cursor-pointer px-2.5 py-1 h-7 gap-1',
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

            {/* Assignee filter (multi-select) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    'cursor-pointer px-2.5 py-1 h-7 gap-1',
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
                {/* Todos option */}
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
                
                {/* Sin asignar option */}
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
                    'cursor-pointer px-2.5 py-1 h-7 gap-1',
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

            {/* Clear filters */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Reports button */}
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href="/dashboard/reports">
              <FileText className="h-4 w-4" />
              Ver reporte
            </a>
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
      <NewTaskModal open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </div>
  )
}
