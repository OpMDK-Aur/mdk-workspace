'use client'

import { useState } from 'react'
import type { TaskPriority, TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, PRIORITY_CONFIG, TYPE_CONFIG, ASSIGNEES } from '@/lib/tasks/task-store'
import { KanbanView } from './kanban-view'
import { ListView } from './list-view'
import { TaskDetailPanel } from './task-detail-panel'
import { NewTaskModal } from './new-task-modal'
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
  Filter,
  ChevronDown,
  FileText,
  X,
} from 'lucide-react'

export function TaskBoard() {
  const { view, setView, filters, setFilter, clearFilters } = useTaskStore()
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  const hasFilters = filters.priority || filters.assigneeId || filters.type || filters.dueThisWeek
  const activeFilterCount = [filters.priority, filters.assigneeId, filters.type, filters.dueThisWeek].filter(Boolean).length

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
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter chips */}
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
                  Alta prioridad
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

            {/* This week filter */}
            <Badge
              variant="outline"
              className={cn(
                'cursor-pointer px-2.5 py-1 h-7',
                filters.dueThisWeek && 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              )}
              onClick={() => setFilter('dueThisWeek', !filters.dueThisWeek)}
            >
              Esta semana
            </Badge>

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
        {view === 'kanban' ? (
          <KanbanView onAddTask={() => setNewTaskOpen(true)} />
        ) : (
          <div className="p-4 h-full overflow-auto">
            <ListView />
          </div>
        )}
      </div>

      {/* Detail panel */}
      <TaskDetailPanel />

      {/* New task modal */}
      <NewTaskModal open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </div>
  )
}
