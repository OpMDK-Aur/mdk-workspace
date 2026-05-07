'use client'

import { useState, useEffect } from 'react'
import type { TaskPriority, TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, PRIORITY_CONFIG, TYPE_CONFIG, ASSIGNEES } from '@/lib/tasks/task-store'
import { KanbanView } from './kanban-view'
import { ListView } from './list-view'
import { CalendarView } from './calendar-view'
import { TaskDetailPanel } from './task-detail-panel'
import { NewTaskModal } from './new-task-modal'
import { FilterBuilder } from './filter-builder'
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
} from 'lucide-react'

export function TaskBoard() {
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
    loadTasks,
    isLoading,
  } = useTaskStore()
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  // Auto-generate seguimiento tasks on mount, then load all tasks
  useEffect(() => {
    const initTasks = async () => {
      // Generar tareas de seguimiento si es lunes o viernes
      const today = new Date()
      const dayOfWeek = today.getDay()
      if (dayOfWeek === 1 || dayOfWeek === 5) {
        try {
          await fetch('/api/tasks/generate-seguimiento', { method: 'POST' })
        } catch (e) {
          // Silently fail - tasks will be created next time
        }
      }
      loadTasks()
    }
    initTasks()
  }, [loadTasks])

  const hasSimpleFilters = filters.priority || filters.assigneeId || filters.type || filters.dueThisWeek
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

            {/* Assignee filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    'cursor-pointer px-2.5 py-1 h-7 gap-1',
                    filters.assigneeId && 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  )}
                >
                  {filters.assigneeId
                    ? ASSIGNEES.find((a) => a.id === filters.assigneeId)?.name ?? 'Asignado'
                    : 'Asignado'}
                  <ChevronDown className="h-3 w-3" />
                </Badge>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {ASSIGNEES.map((a) => (
                  <DropdownMenuCheckboxItem
                    key={a.id}
                    checked={filters.assigneeId === a.id}
                    onCheckedChange={(checked) => setFilter('assigneeId', checked ? a.id : null)}
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
