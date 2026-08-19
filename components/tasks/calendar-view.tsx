'use client'

import { useState, useMemo } from 'react'
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  startOfDay,
  endOfDay,
  addMonths,
  subMonths,
  isPast,
  parseISO
} from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useTaskStore, useFilteredTasks, PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/tasks/task-store'
import type { Task } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  AlertCircle,
  MessageCircle,
  RotateCcw,
  Plus,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NewTaskModal } from './new-task-modal'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

interface TaskBar {
  task: Task
  startCol: number
  endCol: number
}

function getTaskRange(task: Task): { start: Date; end: Date } | null {
  const dueDateRaw = task.dueDate
  if (!dueDateRaw) return null
  const dueDate = typeof dueDateRaw === 'string' ? parseISO(dueDateRaw) : dueDateRaw
  const startDateRaw = task.startDate
    ? (typeof task.startDate === 'string' ? parseISO(task.startDate) : task.startDate)
    : dueDate
  const start = startOfDay(startDateRaw <= dueDate ? startDateRaw : dueDate)
  const end = endOfDay(startDateRaw <= dueDate ? dueDate : startDateRaw)
  return { start, end }
}

// Compute one continuous bar per task for the days of this week it covers,
// clamped to the week's own start/end so the bar breaks and resumes on the next row.
function computeWeekBars(weekDates: Date[], tasks: Task[]): TaskBar[] {
  const weekStart = startOfDay(weekDates[0])
  const weekEnd = endOfDay(weekDates[weekDates.length - 1])
  const bars: TaskBar[] = []

  tasks.forEach((task) => {
    const range = getTaskRange(task)
    if (!range) return
    if (range.end < weekStart || range.start > weekEnd) return

    const clampedStart = range.start < weekStart ? weekStart : range.start
    const clampedEnd = range.end > weekEnd ? weekEnd : range.end

    const startCol = weekDates.findIndex((d) => isSameDay(d, clampedStart))
    const endCol = weekDates.findIndex((d) => isSameDay(d, clampedEnd))
    if (startCol === -1 || endCol === -1) return

    bars.push({ task, startCol, endCol })
  })

  return bars
}

// Greedily pack bars into lanes so overlapping date ranges stack into separate rows.
function assignLanes(bars: TaskBar[]): TaskBar[][] {
  const lanes: TaskBar[][] = []
  const sorted = [...bars].sort(
    (a, b) => getCalendarStatusRank(a.task.status) - getCalendarStatusRank(b.task.status) || a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol),
  )

  sorted.forEach((bar) => {
    const lane = lanes.find((existingLane) =>
      existingLane.every((placed) => bar.startCol > placed.endCol || bar.endCol < placed.startCol),
    )
    if (lane) {
      lane.push(bar)
    } else {
      lanes.push([bar])
    }
  })

  return lanes
}

interface DayNumberCellProps {
  date: Date
  isCurrentMonth: boolean
  onAddTask: (date: Date) => void
}

function DayNumberCell({ date, isCurrentMonth, onAddTask }: DayNumberCellProps) {
  const today = isToday(date)
  const pastDay = isPast(date) && !today

  return (
    <div
      className={cn(
        'group/day flex items-center justify-between border-r border-b px-1.5 py-1 last:border-r-0 bg-muted/40',
        !isCurrentMonth && 'bg-muted/60',
        today && 'bg-primary/15',
        pastDay && isCurrentMonth && 'bg-muted/50',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium',
          today && 'bg-blue-600 text-white font-bold',
          !today && !isCurrentMonth && 'text-muted-foreground/50',
          !today && pastDay && isCurrentMonth && 'text-muted-foreground',
          !today && isCurrentMonth && !pastDay && 'text-foreground',
        )}
      >
        {format(date, 'd')}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onAddTask(date)
        }}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded opacity-0 transition-colors hover:bg-primary/20 group-hover/day:opacity-100',
          !isCurrentMonth && 'text-muted-foreground/50',
        )}
        title="Crear tarea"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

interface TaskBarCardProps {
  task: Task
  startCol: number
  endCol: number
  onTaskClick: (taskId: string) => void
}

function TaskBarCard({ task, startCol, endCol, onTaskClick }: TaskBarCardProps) {
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media
  const isSystemTask = task.isSystemTask
  const isResuelto = task.status === 'resuelto'
  const dueDate = task.dueDate ? (typeof task.dueDate === 'string' ? parseISO(task.dueDate) : task.dueDate) : null
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate) && task.status !== 'resuelto'

  return (
    <button
      onClick={() => onTaskClick(task.id)}
      style={{ gridColumn: `${startCol + 1} / ${endCol + 2}` }}
      className={cn(
        'rounded-xl border border-gray-200 px-2.5 py-2 text-left shadow-sm transition-all',
        'bg-white dark:border-border dark:bg-card',
        'hover:border-primary/50 hover:shadow-md',
        isOverdue && !isSystemTask && 'ring-1 ring-red-400/60',
        isResuelto && 'border-green-500/60 bg-green-500/5 opacity-60',
      )}
    >
      <div className="flex items-start gap-1.5">
        {isSystemTask && <RotateCcw className="h-3 w-3 text-teal-500 shrink-0 mt-0.5" />}
        {isOverdue && !isSystemTask && <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />}
        <span className="flex-1 text-[11px] font-semibold text-gray-900 dark:text-foreground break-words line-clamp-1">
          {task.title}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {isSystemTask ? (
          <Badge
            variant="outline"
            className="h-3.5 px-1 text-[9px] border-0 bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 font-medium"
          >
            Semanal
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className={cn('h-3.5 px-1 text-[9px] border-0 font-medium', priorityConfig.bgColor, priorityConfig.color)}
          >
            {priorityConfig.label}
          </Badge>
        )}
        <div className="flex -space-x-1">
          {task.assignees && task.assignees.length > 0 ? (
            <>
              {task.assignees.slice(0, 2).map((a, i) => (
                <Avatar key={a.id} className="h-4 w-4 border border-card" style={{ zIndex: 2 - i }}>
                  {a.avatar_url && <AvatarImage src={a.avatar_url} alt={a.nombre} />}
                  <AvatarFallback className="text-[6px]">{getInitials(a.nombre)}</AvatarFallback>
                </Avatar>
              ))}
              {task.assignees.length > 2 && (
                <div className="h-4 w-4 rounded-full bg-muted border border-card flex items-center justify-center text-[6px] font-medium" style={{ zIndex: 0 }}>
                  +{task.assignees.length - 2}
                </div>
              )}
            </>
          ) : (task.assigneeAvatar || task.assigneeName) ? (
            <Avatar className="h-4 w-4 shrink-0">
              {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName} />}
              <AvatarFallback className="text-[7px]">{getInitials(task.assigneeName)}</AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      </div>
    </button>
  )
}

const MAX_VISIBLE_LANES = 3

const CALENDAR_STATUS_ORDER: Record<string, number> = {
  pendiente_aprobacion: 0,
  pendiente: 1,
  resolviendo: 2,
  demorada: 3,
  resuelto: 4,
  no_resuelto: 5,
  pausada: 6,
}

function getCalendarStatusRank(status: string): number {
  return CALENDAR_STATUS_ORDER[status.toLowerCase().replace(/\s+/g, '_')] ?? 99
}

function sortCalendarTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const statusOrder = getCalendarStatusRank(a.status) - getCalendarStatusRank(b.status)
    if (statusOrder !== 0) return statusOrder
    return a.title.localeCompare(b.title, 'es')
  })
}

interface WeekRowProps {
  weekDates: Date[]
  tasks: Task[]
  currentMonth: Date
  onTaskClick: (taskId: string) => void
  onAddTask: (date: Date) => void
}

function WeekRow({ weekDates, tasks, currentMonth, onTaskClick, onAddTask }: WeekRowProps) {
  const bars = useMemo(() => computeWeekBars(weekDates, tasks), [weekDates, tasks])
  const lanes = useMemo(() => assignLanes(bars), [bars])
  const visibleLanes = lanes.slice(0, MAX_VISIBLE_LANES)
  const overflowByDay = useMemo(() => {
    const result = new Map<string, Task[]>()
    weekDates.forEach((date, dayIndex) => {
      const visibleTaskIds = new Set(
        visibleLanes.flatMap((lane) => lane.filter((bar) => bar.startCol <= dayIndex && bar.endCol >= dayIndex).map((bar) => bar.task.id)),
      )
      const dayTasks = sortCalendarTasks(
        bars
          .filter((bar) => bar.startCol <= dayIndex && bar.endCol >= dayIndex && !visibleTaskIds.has(bar.task.id))
          .map((bar) => bar.task),
      ).filter((task, index, all) => all.findIndex((candidate) => candidate.id === task.id) === index)
      if (dayTasks.length > 0) result.set(format(date, 'yyyy-MM-dd'), dayTasks)
    })
    return result
  }, [bars, visibleLanes, weekDates])
  const overflowCountByDay = useMemo(
    () => new Map([...overflowByDay.entries()].map(([key, dayTasks]) => [key, dayTasks.length])),
    [overflowByDay],
  )

  return (
    <div className="border-b">
      <div className="grid grid-cols-7" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {weekDates.map((date) => (
          <DayNumberCell
            key={date.toISOString()}
            date={date}
            isCurrentMonth={isSameMonth(date, currentMonth)}
            onAddTask={onAddTask}
          />
        ))}
      </div>

      <div className="relative min-h-[20px]">
        {/* Day separator lines behind the task bars */}
        <div className="absolute inset-0 grid grid-cols-7" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {weekDates.map((date) => (
            <div key={date.toISOString()} className="border-r last:border-r-0" />
          ))}
        </div>

        <div className="relative flex flex-col gap-1 px-1.5 pt-1.5 pb-5">
        {visibleLanes.map((lane, laneIdx) => (
          <div
            key={laneIdx}
            className="grid grid-cols-7 gap-1"
            style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
          >
            {lane.map((bar) => (
              <TaskBarCard
                key={bar.task.id}
                task={bar.task}
                startCol={bar.startCol}
                endCol={bar.endCol}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        ))}

        {weekDates.map((date, dayIndex) => {
          const dayKey = format(date, 'yyyy-MM-dd')
          const overflowTasks = overflowByDay.get(dayKey) ?? []
          if (overflowTasks.length === 0) return null
          return (
            <Popover key={dayKey}>
              <PopoverTrigger asChild>
                <button
                  className="absolute bottom-0 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 hover:text-primary/80 rounded"
                  style={{ left: `${(dayIndex / 7) * 100}%`, width: `${100 / 7}%` }}
                  onClick={(event) => event.stopPropagation()}
                >
                  +{overflowTasks.length} más
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0 shadow-lg border" align="center" side="bottom" sideOffset={8} onClick={(event) => event.stopPropagation()}>
                <div className="sticky top-0 bg-background/95 px-4 py-3 border-b backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-foreground capitalize">{format(date, 'd MMMM', { locale: es })}</span>
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">{overflowTasks.length} tareas</span>
                  </div>
                </div>
                <ScrollArea className="h-80 w-full">
                  <div className="flex flex-col gap-1 px-2 py-2">
                  {overflowTasks.map((task) => {
                    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media
                    const dueDate = task.dueDate ? (typeof task.dueDate === 'string' ? parseISO(task.dueDate) : task.dueDate) : null
                    const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate) && task.status !== 'resuelto'
                    const isSystemTask = task.isSystemTask
                    const isResuelto = task.status === 'resuelto'

                    return (
                      <button
                        key={task.id}
                        onClick={() => onTaskClick(task.id)}
                        className={cn(
                          'w-full text-left rounded-md px-2.5 py-2 transition-all duration-200',
                          'bg-card/40 border border-border/40 hover:border-primary/50 hover:bg-card/60',
                          'hover:shadow-sm hover:translate-x-0.5',
                          isOverdue && !isSystemTask && 'border-red-400/50 bg-red-400/10',
                          isResuelto && 'border-green-500/60 bg-green-500/5 opacity-50',
                        )}
                      >
                        <div className="flex items-start gap-1.5 mb-1.5">
                          <div className="flex items-start gap-1 flex-1 min-w-0">
                            {isSystemTask && <RotateCcw className="h-3 w-3 text-teal-500 shrink-0 mt-0.5" />}
                            {isOverdue && !isSystemTask && <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />}
                            <span className="flex-1 text-xs font-medium text-foreground break-words line-clamp-3">
                              {task.title}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isSystemTask ? (
                            <Badge variant="outline" className="h-4 px-1.5 text-[8px] border-0 bg-teal-100/60 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 font-medium">
                              Semanal
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={cn('h-4 px-1.5 text-[8px] border-0 font-medium', priorityConfig.bgColor, priorityConfig.color)}>
                              {priorityConfig.label}
                            </Badge>
                          )}
                        </div>
                      </button>
                    )
                  })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )
        })}
        </div>
      </div>
    </div>
  )
}

export function CalendarView() {
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const tasks = useFilteredTasks()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [newTaskModalOpen, setNewTaskModalOpen] = useState(false)
  const [selectedDateForTask, setSelectedDateForTask] = useState<Date | null>(null)
  const [isNoDateCollapsed, setIsNoDateCollapsed] = useState(false)
  
  const handleAddTask = (date: Date) => {
    setSelectedDateForTask(date)
    setNewTaskModalOpen(true)
  }
  
  // Get tasks without any calendar date
  const tasksWithoutDate = useMemo(() => {
    return tasks.filter((task) => !task.startDate && !task.dueDate)
  }, [tasks])
  
  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }) // Monday
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [currentMonth])

  // Group days into week rows so multi-day tasks can render as one continuous
  // bar per week, breaking and resuming across the week boundary.
  const weeks = useMemo(() => {
    const result: Date[][] = []
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7))
    }
    return result
  }, [calendarDays])
  
  const weekDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
  
  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const handleToday = () => setCurrentMonth(new Date())
  
  return (
    <div className="flex h-full">
      {/* Main calendar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Calendar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="h-7 text-xs"
            >
              Hoy
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Week days header */}
        <div className="grid grid-cols-7 border-b bg-muted/50" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {weekDays.map((day) => (
            <div 
              key={day} 
              className="py-2 text-center text-xs font-medium text-muted-foreground border-r last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          {weeks.map((weekDates) => (
            <WeekRow
              key={weekDates[0].toISOString()}
              weekDates={weekDates}
              tasks={tasks}
              currentMonth={currentMonth}
              onTaskClick={setSelectedTask}
              onAddTask={handleAddTask}
            />
          ))}
        </div>
      </div>
      
      {/* Sidebar - Tasks without due date */}
      <div className={cn(
        "border-l bg-card/50 flex flex-col transition-all duration-300",
        isNoDateCollapsed ? "w-12" : "w-72"
      )}>
        <button
          onClick={() => setIsNoDateCollapsed(!isNoDateCollapsed)}
          className={cn(
            "px-4 py-3 border-b flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors",
            isNoDateCollapsed ? "w-12 h-auto flex-col gap-2 p-2" : "w-full"
          )}
        >
          {isNoDateCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground rotate-90 whitespace-nowrap h-4 flex items-center">
                {tasksWithoutDate.length}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Sin fecha</h3>
              <Badge variant="secondary" className="ml-auto">
                {tasksWithoutDate.length}
              </Badge>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </button>
        
        {!isNoDateCollapsed && (
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {tasksWithoutDate.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Todas las tareas tienen fecha de vencimiento
                </p>
              ) : (
                tasksWithoutDate.map((task) => {
                  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media
                  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pendiente
                  
                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task.id)}
                      className={cn(
                        'w-full text-left rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-3 transition-colors hover:border-primary/50 hover:shadow-sm',
                        task.status === 'resuelto' && 'opacity-50'
                      )}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-foreground truncate">{task.title}</p>
                      <p className="text-xs text-gray-500 dark:text-muted-foreground truncate mt-0.5">
                        {task.clientName}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn('h-5 px-1.5 text-[10px] border-0 font-medium', statusConfig.bgColor, statusConfig.color)}
                          >
                            {statusConfig.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn('h-5 px-1.5 text-[10px] border-0 font-medium', priorityConfig.bgColor, priorityConfig.color)}
                          >
                            {priorityConfig.label}
                          </Badge>
                        </div>
                        {/* Assignees stack */}
                        <div className="flex -space-x-1">
                          {task.assignees && task.assignees.length > 0 ? (
                            <>
                              {task.assignees.slice(0, 2).map((a, i) => (
                                <Avatar key={a.id} className="h-4 w-4 border border-card" style={{ zIndex: 2 - i }}>
                                  {a.avatar_url && <AvatarImage src={a.avatar_url} alt={a.nombre} />}
                                  <AvatarFallback className="text-[6px]">{getInitials(a.nombre)}</AvatarFallback>
                                </Avatar>
                              ))}
                              {task.assignees.length > 2 && (
                                <div className="h-4 w-4 rounded-full bg-muted border border-card flex items-center justify-center text-[6px] font-medium" style={{ zIndex: 0 }}>
                                  +{task.assignees.length - 2}
                                </div>
                              )}
                            </>
                          ) : (task.assigneeAvatar || task.assigneeName) ? (
                            <Avatar className="h-4 w-4">
                              {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName} />}
                              <AvatarFallback className="text-[7px]">{getInitials(task.assigneeName)}</AvatarFallback>
                            </Avatar>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        )}
      </div>
      
      {/* New Task Modal */}
      <NewTaskModal 
        open={newTaskModalOpen} 
        onOpenChange={setNewTaskModalOpen}
        initialDueDate={selectedDateForTask}
      />
    </div>
  )
}
