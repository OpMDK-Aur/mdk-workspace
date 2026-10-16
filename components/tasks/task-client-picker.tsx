'use client'

import type { ReactNode } from 'react'
import { Split } from 'lucide-react'
import type { Task, TaskClient } from '@/lib/types'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

export type ClientChoice = { clientId: string; splitClientIds?: undefined } | { clientId: string; splitClientIds: string[] }

export function getTaskClients(task: Task): TaskClient[] {
  const list = task.clients?.length
    ? task.clients
    : task.clientId
      ? [{ id: task.clientId, nombre_del_negocio: task.clientName }]
      : []
  const seen = new Set<string>()
  return list.filter((c) => c.id && !seen.has(c.id) && seen.add(c.id))
}

interface TaskClientPickerProps {
  clients: TaskClient[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChoose: (choice: ClientChoice) => void
  children: ReactNode
}

export function TaskClientPicker({ clients, open, onOpenChange, onChoose, children }: TaskClientPickerProps) {
  const choose = (choice: ClientChoice) => {
    onOpenChange(false)
    onChoose(choice)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        align="end"
        className="w-64 p-1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
          {'¿A qué cliente cargás el tiempo?'}
        </p>
        <div className="flex flex-col" role="menu">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              onClick={() => choose({ clientId: c.id })}
              className="truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              {c.nombre_del_negocio || 'Cliente sin nombre'}
            </button>
          ))}
          <div className="my-1 h-px bg-border" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => choose({ clientId: clients[0].id, splitClientIds: clients.map((c) => c.id) })}
            className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <Split className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex flex-col">
              <span>{`Dividir entre los ${clients.length}`}</span>
              <span className="text-xs text-muted-foreground">Al parar se reparte el tiempo en partes iguales</span>
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
