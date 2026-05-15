'use client'

import { useEffect, useState } from 'react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, STATUS_CONFIG, PRIORITY_CONFIG, TYPE_CONFIG } from '@/lib/tasks/task-store'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { 
  Users, 
  Megaphone, 
  Headphones, 
  Link, 
  FileText, 
  Code, 
  Video,
  HelpCircle,
  CalendarDays,
  AlertCircle
} from 'lucide-react'
import { format, isToday, isTomorrow, isPast, isBefore, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

// Icon mapping for task types
const TYPE_ICONS: Record<string, React.ReactNode> = {
  users: <Users className="h-3 w-3" />,
  megaphone: <Megaphone className="h-3 w-3" />,
  headphones: <Headphones className="h-3 w-3" />,
  link: <Link className="h-3 w-3" />,
  'file-text': <FileText className="h-3 w-3" />,
  code: <Code className="h-3 w-3" />,
  video: <Video className="h-3 w-3" />,
}

interface TaskCardProps {
  task: Task
  onClick: () => void
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getClientColor(clientId: string): string {
  const colors = [
    'bg-cyan-500',
    'bg-blue-500',
    'bg-violet-500',
    'bg-pink-500',
    'bg-orange-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-red-500',
  ]
  const index = clientId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}

function formatDueDate(date: Date): { text: string; color: string; urgent: boolean } {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const dueDate = new Date(date)
  dueDate.setHours(0, 0, 0, 0)
  
  if (isPast(dueDate) && !isToday(dueDate)) {
    return { text: 'Vencida', color: 'text-red-400', urgent: true }
  }
  if (isToday(dueDate)) {
    return { text: 'Hoy', color: 'text-orange-400', urgent: true }
  }
  if (isTomorrow(dueDate)) {
    return { text: 'Manana', color: 'text-yellow-400', urgent: false }
  }
  if (isBefore(dueDate, addDays(now, 7))) {
    return { text: format(date, 'EEE d', { locale: es }), color: 'text-muted-foreground', urgent: false }
  }
  return { text: format(date, 'd MMM', { locale: es }), color: 'text-muted-foreground', urgent: false }
}

// Default fallback for task types not in TYPE_CONFIG (e.g., UUIDs from DB)
const DEFAULT_TYPE_CONFIG = { label: 'Tarea', color: 'bg-gray-500/20 text-gray-400', icon: undefined }

export function TaskCard({ task, onClick }: TaskCardProps) {
  const [liveTime, setLiveTime] = useState(task.totalTimeSec)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [tempTitle, setTempTitle] = useState(task.title)
  const updateTask = useTaskStore((s) => s.updateTask)
  const priorityConfig = PRIORITY_CONFIG[task.priority] || { label: 'Media', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' }
  // Use TYPE_CONFIG if type is a known key, try typeName lowercase, otherwise fallback
  const typeNameKey = task.typeName?.toLowerCase().replace(/ /g, '_') || ''
  const typeConfig = TYPE_CONFIG[task.type] || TYPE_CONFIG[typeNameKey] || TYPE_CONFIG[task.typeName?.toLowerCase() || ''] || { 
    label: task.typeName || 'Tarea', 
    color: 'bg-gray-500/20 text-gray-400', 
    icon: undefined 
  }

  // Live timer update
  useEffect(() => {
    if (!task.isTimerRunning || !task.timerStartedAt) {
      setLiveTime(task.totalTimeSec)
      return
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(task.timerStartedAt!).getTime()) / 1000)
      setLiveTime(task.totalTimeSec + elapsed)
    }, 1000)

    return () => clearInterval(interval)
  }, [task.isTimerRunning, task.timerStartedAt, task.totalTimeSec])

  const handleStartEditTitle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTempTitle(task.title)
    setIsEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    if (tempTitle.trim() && tempTitle !== task.title) {
      await updateTask(task.id, { title: tempTitle.trim() })
    }
    setIsEditingTitle(false)
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-lg border bg-card p-3 cursor-pointer transition-all duration-200',
        'hover:border-primary/40 hover:shadow-md hover:shadow-primary/5',
        'active:scale-[0.98]',
        'w-full min-w-0 overflow-hidden'
      )}
    >
      {/* Client badge + avatar row */}
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <Avatar className={cn('h-5 w-5 shrink-0', getClientColor(task.clientId))}>
          <AvatarFallback className="text-[9px] font-semibold text-white bg-transparent">
            {getInitials(task.clientName)}
          </AvatarFallback>
        </Avatar>
        <span className="text-[11px] text-muted-foreground font-medium truncate min-w-0">
          {task.clientName}
        </span>
      </div>

      {/* Title */}
      {isEditingTitle ? (
        <Input
          value={tempTitle}
          onChange={(e) => setTempTitle(e.target.value)}
          onBlur={handleSaveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveTitle()
            if (e.key === 'Escape') setIsEditingTitle(false)
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-7 text-sm mb-2"
          autoFocus
        />
      ) : (
        <h4 
          className="text-sm font-medium text-foreground leading-snug mb-2 line-clamp-2 break-words overflow-hidden cursor-text hover:text-primary"
          onClick={handleStartEditTitle}
        >
          {task.title}
        </h4>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-2 min-w-0">
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 h-5 font-medium border-0 shrink-0', priorityConfig.bgColor, priorityConfig.color)}
        >
          {priorityConfig.label}
        </Badge>
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 h-5 font-medium border-0 gap-1 flex items-center shrink-0 max-w-[140px] truncate', typeConfig.color)}
        >
          {typeConfig.icon && TYPE_ICONS[typeConfig.icon] ? TYPE_ICONS[typeConfig.icon] : <HelpCircle className="h-3 w-3 shrink-0" />}
          <span className="truncate">{typeConfig.label}</span>
        </Badge>
      </div>

      {/* Bottom row: time, due date, assignee */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          {/* Time tracked */}
          <div className="flex items-center gap-1.5">
            {task.isTimerRunning && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            )}
            <span className={cn('font-mono tabular-nums', task.isTimerRunning && 'text-green-400 font-medium')}>
              {formatTime(liveTime)}
            </span>
          </div>
          {/* Due date */}
          {task.dueDate && (() => {
            const { text, color, urgent } = formatDueDate(new Date(task.dueDate))
            return (
              <div className={cn('flex items-center gap-1', color)}>
                {urgent ? <AlertCircle className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                <span className="font-medium">{text}</span>
              </div>
            )
          })()}
        </div>
        {/* Assignees stack */}
        <div className="flex -space-x-1.5">
          {task.assignees && task.assignees.length > 0 ? (
            <>
              {task.assignees.slice(0, 3).map((a, i) => (
                <Avatar key={a.id} className="h-5 w-5 border-2 border-card" style={{ zIndex: 3 - i }}>
                  {a.avatar_url && <AvatarImage src={a.avatar_url} alt={a.nombre} />}
                  <AvatarFallback className="text-[8px] bg-muted text-muted-foreground">
                    {getInitials(a.nombre)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {task.assignees.length > 3 && (
                <div className="h-5 w-5 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[8px] font-medium text-muted-foreground" style={{ zIndex: 0 }}>
                  +{task.assignees.length - 3}
                </div>
              )}
            </>
          ) : (
            <Avatar className="h-5 w-5 border border-border">
              {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt={task.assigneeName} />}
              <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                {getInitials(task.assigneeName)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )
}
