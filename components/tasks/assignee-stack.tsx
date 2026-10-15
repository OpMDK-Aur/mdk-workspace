'use client'

import { memo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/types'

type Person = { id: string; nombre: string; apellido?: string | null; avatar_url?: string | null }

const SIZES = {
  xs: { box: 'h-4 w-4', text: 'text-[7px]', overlap: '-space-x-1' },
  sm: { box: 'h-5 w-5', text: 'text-[8px]', overlap: '-space-x-1.5' },
} as const

function initials(name?: string | null) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function fullName(p: Person) {
  return [p.nombre, p.apellido].filter(Boolean).join(' ')
}

export function getTaskAssignees(task: Pick<Task, 'assignees' | 'assigneeId' | 'assigneeName' | 'assigneeAvatar'>): Person[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees as Person[]
  if (task.assigneeId && task.assigneeName && task.assigneeName !== 'Sin asignar') {
    return [{ id: task.assigneeId, nombre: task.assigneeName, avatar_url: task.assigneeAvatar ?? null }]
  }
  return []
}

interface AssigneeStackProps {
  people: Person[]
  size?: keyof typeof SIZES
  max?: number
  showNames?: boolean
  className?: string
}

export const AssigneeStack = memo(function AssigneeStack({
  people,
  size = 'sm',
  max = 3,
  showNames = false,
  className,
}: AssigneeStackProps) {
  const s = SIZES[size]

  if (people.length === 0) {
    return <span className={cn('text-xs text-muted-foreground', className)}>Sin asignar</span>
  }

  const visible = people.slice(0, max)
  const extra = people.length - visible.length
  const names = people.map(fullName).join(', ')

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex min-w-0 items-center gap-2', className)} aria-label={`Responsables: ${names}`}>
            <div className={cn('flex shrink-0', s.overlap)}>
              {visible.map((p, i) => (
                <Avatar
                  key={p.id}
                  className={cn(s.box, 'border-2 border-card')}
                  style={{ zIndex: visible.length - i }}
                >
                  {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                  <AvatarFallback className={cn(s.text, 'bg-muted text-muted-foreground')}>
                    {initials(p.nombre)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {extra > 0 && (
                <div
                  className={cn(
                    s.box,
                    s.text,
                    'flex items-center justify-center rounded-full border-2 border-card bg-muted font-medium text-muted-foreground',
                  )}
                >
                  +{extra}
                </div>
              )}
            </div>
            {showNames && (
              <span className="truncate text-sm text-muted-foreground">
                {people.length === 1 ? fullName(people[0]) : `${people[0].nombre} y ${people.length - 1} más`}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {names}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
