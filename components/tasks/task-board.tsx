'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { TaskPriority, TaskType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, useTaskStoreHydrated, PRIORITY_CONFIG, TYPE_CONFIG, ASSIGNEES } from '@/lib/tasks/task-store'
import { createClient } from '@/lib/supabase/client'

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
  FileText,
  X,
  Search,
  Building2,
  Check,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

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
  const [availableClients, setAvailableClients] = useState<{ id: string; nombre_del_negocio: string }[]>([])
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false)
  
  // Track if seguimiento was already generated this session
  const seguimientoGenerated = useRef(false)
  
  // Load available clients for filter
  useEffect(() => {
    const supabase = createClient()
    supabase.from('clientes').select('id, nombre_del_negocio').order('nombre_del_negocio')
      .then(({ data }) => { if (data) setAvailableClients(data) })
  }, [])

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

  const hasSimpleFilters = filters.priority || filters.assigneeIds.length > 0 || filters.type || filters.dueThisWeek || filters.searchQuery || filters.showUnassigned || (filters.clientIds?.length ?? 0) > 0
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
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          {/* New Task */}
          <Button className="gap-1.5" onClick={() => { setNewTaskMode('manual'); setNewTaskOpen(true) }}>
            <Plus className="h-4 w-4" />
            Nueva tarea
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setMeetingOpen(true)}>
            <Calendar className="h-4 w-4" />
            Agendar reunion
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
          {/* Search tasks */}
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

          {/* Client filter */}
          <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 gap-1.5 text-xs',
                  (filters.clientIds?.length ?? 0) > 0 && 'border-primary/50 bg-primary/5 text-primary'
                )}
              >
                <Building2 className="h-3.5 w-3.5" />
                {(filters.clientIds?.length ?? 0) === 0
                  ? 'Cliente'
                  : (filters.clientIds?.length ?? 0) === 1
                    ? availableClients.find(c => c.id === filters.clientIds![0])?.nombre_del_negocio ?? 'Cliente'
                    : `${filters.clientIds!.length} clientes`
                }
                {(filters.clientIds?.length ?? 0) > 0 && (
                  <span
                    className="ml-0.5 text-primary/60 hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); setFilter('clientIds', []) }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">Filtrar por cliente</p>
              <Command>
                <CommandInput placeholder="Buscar cliente..." className="h-8 text-xs" />
                <CommandList className="max-h-56 overflow-y-auto">
                  <CommandEmpty className="text-xs text-muted-foreground py-3 text-center">Sin resultados</CommandEmpty>
                  <CommandGroup>
                    {availableClients.map((client) => {
                      const selected = filters.clientIds?.includes(client.id) ?? false
                      return (
                        <CommandItem
                          key={client.id}
                          value={client.nombre_del_negocio}
                          onSelect={() => {
                            const current = filters.clientIds ?? []
                            setFilter('clientIds', selected
                              ? current.filter(id => id !== client.id)
                              : [...current, client.id]
                            )
                          }}
                          className="text-xs flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                        >
                          <div className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                          )}>
                            {selected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="flex-1 truncate">{client.nombre_del_negocio}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

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
      <NewTaskModal open={newTaskOpen} onOpenChange={setNewTaskOpen} initialMode={newTaskMode} />
      <ScheduleMeetingModal open={meetingOpen} onOpenChange={setMeetingOpen} />
    </div>
  )
}
