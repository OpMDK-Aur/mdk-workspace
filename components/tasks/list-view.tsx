'use client'

import { useEffect, useState } from 'react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, useFilteredTasks, STATUS_CONFIG, PRIORITY_CONFIG, TYPE_CONFIG } from '@/lib/tasks/task-store'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDate(date: Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(date)
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

type SortKey = 'title' | 'clientName' | 'status' | 'priority' | 'dueDate' | 'totalTimeSec'
type SortDir = 'asc' | 'desc'

function TaskRow({ task }: { task: Task }) {
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const [liveTime, setLiveTime] = useState(task.totalTimeSec)
  const statusConfig = STATUS_CONFIG[task.status] || { label: task.status, color: 'text-gray-400', bgColor: 'bg-gray-500/20' }
  const priorityConfig = PRIORITY_CONFIG[task.priority] || { label: 'Media', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' }
  const typeNameKey = task.typeName?.toLowerCase().replace(/ /g, '_') || ''
  const typeConfig = TYPE_CONFIG[task.type] || TYPE_CONFIG[typeNameKey] || TYPE_CONFIG[task.typeName?.toLowerCase() || ''] || { label: task.typeName || 'Tarea', color: 'bg-gray-500/20 text-gray-400' }

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
    <TableRow
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => setSelectedTask(task.id)}
    >
      <TableCell className="max-w-[300px]">
        <p className="font-medium text-sm truncate">{task.title}</p>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">{task.clientName}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn('text-xs border-0', statusConfig.bgColor, statusConfig.color)}>
          {statusConfig.label}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn('text-xs border-0', priorityConfig.bgColor, priorityConfig.color)}>
          {priorityConfig.label}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn('text-xs border-0', typeConfig.color)}>
          {typeConfig.label}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[9px] bg-muted">{getInitials(task.assigneeName)}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground truncate max-w-[100px]">{task.assigneeName}</span>
        </div>
      </TableCell>
      <TableCell>
        <span className={cn('text-sm', task.dueDate && task.dueDate < new Date() ? 'text-red-400' : 'text-muted-foreground')}>
          {formatDate(task.dueDate)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {task.isTimerRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          )}
          <span className={cn('font-mono tabular-nums text-sm', task.isTimerRunning && 'text-green-400')}>
            {formatTime(liveTime)}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function ListView() {
  const tasks = useFilteredTasks()
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'clientName':
        cmp = a.clientName.localeCompare(b.clientName)
        break
      case 'status':
        const statusOrder = ['pendiente', 'resolviendo', 'demorada', 'pausada', 'pendiente_aprobacion']
        cmp = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
        break
      case 'priority':
        const priorityOrder = ['alta', 'media', 'baja']
        cmp = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
        break
      case 'dueDate':
        const aDate = a.dueDate?.getTime() ?? Infinity
        const bDate = b.dueDate?.getTime() ?? Infinity
        cmp = aDate - bDate
        break
      case 'totalTimeSec':
        cmp = a.totalTimeSec - b.totalTimeSec
        break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const SortButton = ({ sortKeyProp, children }: { sortKeyProp: SortKey; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 hover:bg-transparent"
      onClick={() => handleSort(sortKeyProp)}
    >
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  )

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[300px]">
              <SortButton sortKeyProp="title">Tarea</SortButton>
            </TableHead>
            <TableHead>
              <SortButton sortKeyProp="clientName">Cliente</SortButton>
            </TableHead>
            <TableHead>
              <SortButton sortKeyProp="status">Estado</SortButton>
            </TableHead>
            <TableHead>
              <SortButton sortKeyProp="priority">Prioridad</SortButton>
            </TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Asignado</TableHead>
            <TableHead>
              <SortButton sortKeyProp="dueDate">Vencimiento</SortButton>
            </TableHead>
            <TableHead>
              <SortButton sortKeyProp="totalTimeSec">Tiempo</SortButton>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
          {sortedTasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                No hay tareas que coincidan con los filtros
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
