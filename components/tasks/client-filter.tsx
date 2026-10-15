'use client'

import { useMemo, useState } from 'react'
import { Building2, Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useTaskStore } from '@/lib/tasks/task-store'

export function ClientFilter() {
  const tasks = useTaskStore((s) => s.tasks)
  const selectedIds = useTaskStore((s) => s.filters.clientIds ?? [])
  const setFilter = useTaskStore((s) => s.setFilter)
  const [open, setOpen] = useState(false)

  const clients = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>()
    for (const task of tasks) {
      const taskClients = task.clients?.length
        ? task.clients
        : task.clientId
        ? [{ id: task.clientId, nombre_del_negocio: task.clientName }]
        : []
      for (const c of taskClients) {
        const entry = counts.get(c.id)
        if (entry) entry.count++
        else counts.set(c.id, { id: c.id, name: c.nombre_del_negocio || 'Sin nombre', count: 1 })
      }
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [tasks])

  const toggle = (id: string) => {
    setFilter(
      'clientIds',
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    )
  }

  const selectedNames = clients.filter((c) => selectedIds.includes(c.id)).map((c) => c.name)
  const label =
    selectedIds.length === 0
      ? 'Clientes'
      : selectedIds.length === 1
      ? selectedNames[0] ?? '1 cliente'
      : `${selectedIds.length} clientes`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Filtrar por cliente"
          className={cn(
            'h-8 gap-1.5 shrink-0 max-w-56',
            selectedIds.length > 0 && 'bg-primary/10 border-primary/30 text-primary'
          )}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente..." />
          <CommandList className="max-h-80">
            <CommandEmpty>No se encontraron clientes</CommandEmpty>
            {selectedIds.length > 0 && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => setFilter('clientIds', [])}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                    Quitar selección ({selectedIds.length})
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup>
              {clients.map((c) => {
                const checked = selectedIds.includes(c.id)
                return (
                  <CommandItem key={c.id} value={`${c.name} ${c.id}`} onSelect={() => toggle(c.id)}>
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'
                      )}
                      aria-hidden="true"
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{c.count}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
