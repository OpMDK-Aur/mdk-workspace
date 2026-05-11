'use client'

import { useCallback, useState } from 'react'
import type { TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore, useTasksByStatus, STATUS_CONFIG, STATUS_ORDER } from '@/lib/tasks/task-store'
import { TaskCard } from './task-card'
import { Button } from '@/components/ui/button'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

const INITIAL_VISIBLE_COUNT = 10

interface KanbanColumnProps {
  status: TaskStatus
  onAddTask: () => void
}

function KanbanColumn({ status, onAddTask }: KanbanColumnProps) {
  const tasksByStatus = useTasksByStatus()
  const tasks = tasksByStatus[status]
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask)
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus)
  const config = STATUS_CONFIG[status]
  const [isExpanded, setIsExpanded] = useState(false)
  
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, INITIAL_VISIBLE_COUNT)
  const hiddenCount = tasks.length - INITIAL_VISIBLE_COUNT

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('ring-2', 'ring-primary/50')
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-2', 'ring-primary/50')
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.currentTarget.classList.remove('ring-2', 'ring-primary/50')
      const taskId = e.dataTransfer.getData('taskId')
      if (taskId) {
        updateTaskStatus(taskId, status)
      }
    },
    [status, updateTaskStatus]
  )

  return (
    <div
      className={cn(
        'flex flex-col min-w-[280px] w-[280px] rounded-xl border bg-surface-2 overflow-hidden transition-all',
        config.borderColor
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className={cn('px-3 py-2.5 border-b flex items-center justify-between', config.borderColor)}>
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', config.bgColor.replace('/10', ''))} />
          <h3 className={cn('text-sm font-semibold', config.color)}>{config.label}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Tasks */}
      <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
        <div className="p-2 space-y-2">
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('taskId', task.id)
                e.currentTarget.classList.add('opacity-50')
              }}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove('opacity-50')
              }}
            >
              <TaskCard task={task} onClick={() => setSelectedTask(task.id)} />
            </div>
          ))}
          
          {/* Expand/Collapse button */}
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Mostrar menos
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  +{hiddenCount} mas
                </>
              )}
            </Button>
          )}
        </div>
      </ScrollArea>

      {/* Add task button */}
      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={onAddTask}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar tarea
        </Button>
      </div>
    </div>
  )
}

interface KanbanViewProps {
  onAddTask: () => void
}

export function KanbanView({ onAddTask }: KanbanViewProps) {
  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 p-4 pb-8 min-w-max">
        {STATUS_ORDER.map((status) => (
          <KanbanColumn key={status} status={status} onAddTask={onAddTask} />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
