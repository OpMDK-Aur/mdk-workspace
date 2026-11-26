'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useAureliaClientOptions } from '../use-aurelia-time'

export type PickedClient = { id: string; name: string } | null

export function ClientPicker({ id, value, onChange }: { id?: string; value: PickedClient; onChange: (client: PickedClient) => void }) {
  const [open, setOpen] = useState(false)
  const { data: clients, isLoading, error } = useAureliaClientOptions()

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="flex-1 justify-between font-normal">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{value?.name ?? 'Sin cliente'}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar cliente..." />
            <CommandList>
              <CommandEmpty>{isLoading ? 'Cargando clientes...' : error ? 'No se pudieron cargar los clientes.' : 'Sin resultados.'}</CommandEmpty>
              <CommandGroup>
                {(clients ?? []).map((client) => (
                  <CommandItem
                    key={client.id}
                    value={`${client.label} ${client.email ?? ''} ${client.id}`}
                    onSelect={() => { onChange({ id: client.id, name: client.label }); setOpen(false) }}
                  >
                    <Check className={cn('size-4', value?.id === client.id ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{client.label}</span>
                      {client.email && <span className="truncate text-xs text-muted-foreground">{client.email}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Quitar cliente">
          <X className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
