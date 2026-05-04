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
import { useTaskStore, PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/tasks/task-store'
import type { Task } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  AlertCircle
} from 'lucide-react'

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
}

function DayTasks({ date, tasks, isCurrentMonth, onTaskClick }: DayTasksProps) {
  const today = isToday(date)
  const pastDay = isPast(date) && !today
  
  return (
    <div 
      className={cn(
        'min-h-[120px] border-r border-b p-1.5 transition-colors',
        !isCurrentMonth && 'bg-muted/30',
        today && 'bg-primary/5 ring-1 ring-inset ring-primary/20',
        pastDay && isCurrentMonth && 'bg-muted/20'
      )}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-1">
        <span 
          className={cn(
            'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
            today && 'bg-primary text-primary-foreground',
            !isCurrentMonth && 'text-muted-foreground/50',
            pastDay && isCurrentMonth && 'text-muted-foreground'
          )}
        >
          {format(date, 'd')}
        </span>
        {tasks.length > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {tasks.length}
          </Badge>
        )}
      </div>
      
      {/* Tasks */}
      <div className="space-y-1">
        {tasks.slice(0, 3).map((task) => {
          const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media
          const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pendiente
          const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && task.status !== 'resuelto'
          
          return (
            <button
              key={task.id}
              onClick={() => onTaskClick(task.id)}
              className={cn(
                'w-full text-left rounded px-1.5 py-1 text-xs transition-colors hover:ring-1 hover:ring-primary/50',
                statusConfig.bgColor,
                isOverdue && 'ring-1 ring-red-500/50'
              )}
            >
              <div className="flex items-center gap-1">
                {isOverdue && <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />}
                <span className={cn(
                  'truncate flex-1',
                  statusConfig.color
                )}>
                  {task.title}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <Badge 
                  variant="outline" 
                  className={cn(
                    'h-4 px-1 text-[9px] border-0',
                    priorityConfig.bgColor,
                    priorityConfig.color
                  )}
                >
                  {priorityConfig.label}
                </Badge>
                {task.assigneeAvatar || task.assigneeName ? (
                  <Avatar className="h-4 w-4">
                    {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName} />}
                    <AvatarFallback className="text-[8px]">{getInitials(task.assigneeName)}</AvatarFallback>
                  </Avatar>
                ) : null}
              </div>
            </button>
          )
        })}
        {tasks.length > 3 && (
          <p className="text-[10px] text-muted-foreground text-center">
            +{tasks.length - 3} mas
          </p>
        )}
      </div>
    </div>
  )
}

export function CalendarView() {
  const { filteredTasks, setSelectedTask } = useTaskStore()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  
  // Group tasks by due date
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, Task[]>()
    
    filteredTasks().forEach((task) => {
      if (task.dueDate) {
        const dateKey = format(new Date(task.dueDate), 'yyyy-MM-dd')
        const existing = grouped.get(dateKey) || []
        grouped.set(dateKey, [...existing, task])
      }
    })
    
    return grouped
  }, [filteredTasks])
  
  // Get tasks without due date
  const tasksWithoutDate = useMemo(() => {
    return filteredTasks().filter((task) => !task.dueDate)
  }, [filteredTasks])
  
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
        <div className="grid grid-cols-7 border-b bg-muted/50">
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
          <div className="grid grid-cols-7">
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
                />
              )
            })}
          </div>
        </div>
      </div>
      
      {/* Sidebar - Tasks without due date */}
      <div className="w-72 border-l bg-card/50 flex flex-col">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Sin fecha</h3>
            <Badge variant="secondary" className="ml-auto">
              {tasksWithoutDate.length}
            </Badge>
          </div>
        </div>
        
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
                      'w-full text-left rounded-lg border p-3 transition-colors hover:border-primary/50',
                      'bg-card'
                    )}
                  >
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {task.clientName}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            'h-5 px-1.5 text-[10px] border-0',
                            statusConfig.bgColor,
                            statusConfig.color
                          )}
                        >
                          {statusConfig.label}
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            'h-5 px-1.5 text-[10px] border-0',
                            priorityConfig.bgColor,
                            priorityConfig.color
                          )}
                        >
                          {priorityConfig.label}
                        </Badge>
                      </div>
                      {task.assigneeAvatar || task.assigneeName ? (
                        <Avatar className="h-5 w-5">
                          {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName} />}
                          <AvatarFallback className="text-[9px]">{getInitials(task.assigneeName)}</AvatarFallback>
                        </Avatar>
                      ) : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
