'use client'

import { useEffect, useState } from 'react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, STATUS_CONFIG, PRIORITY_CONFIG, TYPE_CONFIG } from '@/lib/tasks/task-store'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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

export function TaskCard({ task, onClick }: TaskCardProps) {
  const [liveTime, setLiveTime] = useState(task.totalTimeSec)
  const priorityConfig = PRIORITY_CONFIG[task.priority]
  const typeConfig = TYPE_CONFIG[task.type]

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

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-lg border bg-card p-3 cursor-pointer transition-all duration-200',
        'hover:border-primary/40 hover:shadow-md hover:shadow-primary/5',
        'active:scale-[0.98]'
      )}
    >
      {/* Client badge + avatar row */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className={cn('h-5 w-5 shrink-0', getClientColor(task.clientId))}>
          <AvatarFallback className="text-[9px] font-semibold text-white bg-transparent">
            {getInitials(task.clientName)}
          </AvatarFallback>
        </Avatar>
        <span className="text-[11px] text-muted-foreground font-medium truncate">
          {task.clientName}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-foreground leading-snug mb-2 line-clamp-2">
        {task.title}
      </h4>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 h-5 font-medium border-0', priorityConfig.bgColor, priorityConfig.color)}
        >
          {priorityConfig.label}
        </Badge>
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 h-5 font-medium border-0', typeConfig.color)}
        >
          {typeConfig.label}
        </Badge>
      </div>

      {/* Time tracked row */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
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
        <Avatar className="h-5 w-5 border border-border">
          <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
            {getInitials(task.assigneeName)}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  )
}
