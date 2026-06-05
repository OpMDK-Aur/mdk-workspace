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
  addMonths,
  subMonths,
  isPast
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

interface DayTasksProps {
  date: Date
  tasks: Task[]
  isCurrentMonth: boolean
  onTaskClick: (taskId: string) => void
  onAddTask: (date: Date) => void
}

function DayTasks({ date, tasks, isCurrentMonth, onTaskClick, onAddTask }: DayTasksProps) {
  const today = isToday(date)
  const pastDay = isPast(date) && !today
  
  return (
    <div 
      className={cn(
        'min-h-[120px] border-r border-b p-1.5 transition-colors w-full',
        !isCurrentMonth && 'bg-muted/30',
        today && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
        pastDay && isCurrentMonth && 'bg-muted/20'
      )}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-1 group/day">
        <span 
          className={cn(
            'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
            today && 'bg-blue-600 text-white font-bold',
            !today && !isCurrentMonth && 'text-muted-foreground/50',
            !today && pastDay && isCurrentMonth && 'text-muted-foreground',
            !today && isCurrentMonth && !pastDay && 'text-foreground'
          )}
        >
          {format(date, 'd')}
        </span>
        <div className="flex items-center gap-1">
          {tasks.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {tasks.length}
            </Badge>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddTask(date)
            }}
            className={cn(
              'h-5 w-5 flex items-center justify-center rounded hover:bg-primary/20 transition-colors',
              'opacity-0 group-hover/day:opacity-100',
              !isCurrentMonth && 'text-muted-foreground/50'
            )}
            title="Crear tarea"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      
      {/* Tasks */}
      <div className="space-y-1">
        {tasks.slice(0, 3).map((task) => {
          const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media
          const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pendiente
          const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && task.status !== 'resuelto'
          const isSystemTask = task.isSystemTask
          const isResuelto = task.status === 'resuelto'
          
          return (
            <button
              key={task.id}
              onClick={() => onTaskClick(task.id)}
              className={cn(
                'w-full text-left rounded px-1.5 py-1 text-xs transition-colors',
                'bg-white dark:bg-card border border-gray-200 dark:border-border',
                'hover:border-primary/50 hover:shadow-sm',
                isOverdue && !isSystemTask && 'ring-1 ring-red-400/60',
                isResuelto && 'border-green-500/60 bg-green-500/5'
              )}
            >
              <div className="flex items-start gap-1">
                {isSystemTask && <RotateCcw className="h-3 w-3 text-teal-500 shrink-0 mt-0.5" />}
                {isOverdue && !isSystemTask && <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />}
                <span className="flex-1 text-[11px] font-medium text-gray-900 dark:text-foreground break-words line-clamp-2">
                  {task.title}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
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
                    className={cn(
                      'h-3.5 px-1 text-[9px] border-0 font-medium',
                      priorityConfig.bgColor,
                      priorityConfig.color
                    )}
                  >
                    {priorityConfig.label}
                  </Badge>
                )}
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
                    <Avatar className="h-4 w-4 shrink-0">
                      {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName} />}
                      <AvatarFallback className="text-[7px]">{getInitials(task.assigneeName)}</AvatarFallback>
                    </Avatar>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
        {tasks.length > 3 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full text-[11px] text-primary hover:text-primary/80 font-medium text-center py-0.5 hover:bg-primary/10 rounded transition-colors">
                +{tasks.length - 3} más
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-0 shadow-lg border"
              align="end"
              side="top"
              sideOffset={8}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-gradient-to-r from-background to-background/95 px-4 py-3 border-b backdrop-blur-sm z-10">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-foreground capitalize">
                    {format(date, "EEEE d 'de' MMMM", { locale: es })}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                    {tasks.length} tareas
                  </span>
                </div>
              </div>
              <ScrollArea className="h-80 w-full">
                <div className="px-2 py-2 space-y-1">
                  {tasks.map((task, index) => {
                    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media
                    const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && task.status !== 'resuelto'
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
                          isResuelto && 'border-green-500/60 bg-green-500/5'
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
                          <div className="flex items-center gap-0.5 shrink-0">
                            {task.assignees && task.assignees.length > 0 ? (
                              <div className="flex -space-x-1">
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
                              </div>
                            ) : (task.assigneeAvatar || task.assigneeName) ? (
                              <Avatar className="h-4 w-4 shrink-0">
                                {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName} />}
                                <AvatarFallback className="text-[6px]">{getInitials(task.assigneeName)}</AvatarFallback>
                              </Avatar>
                            ) : null}
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
        )}
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
  
  // Group tasks by due date
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, Task[]>()
    
    tasks.forEach((task) => {
      if (task.dueDate) {
        const dateKey = format(new Date(task.dueDate), 'yyyy-MM-dd')
        const existing = grouped.get(dateKey) || []
        grouped.set(dateKey, [...existing, task])
      }
    })
    
    return grouped
  }, [tasks])
  
  // Get tasks without due date
  const tasksWithoutDate = useMemo(() => {
    return tasks.filter((task) => !task.dueDate)
  }, [tasks])
  
  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }) // Monday
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [currentMonth])
  
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
          <div className="grid grid-cols-7" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {calendarDays.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd')
              const dayTasks = tasksByDate.get(dateKey) || []
              
              return (
                <DayTasks
                  key={dateKey}
                  date={date}
                  tasks={dayTasks}
                  isCurrentMonth={isSameMonth(date, currentMonth)}
                  onTaskClick={setSelectedTask}
                  onAddTask={handleAddTask}
                />
              )
            })}
          </div>
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
                      className="w-full text-left rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-3 transition-colors hover:border-primary/50 hover:shadow-sm"
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
