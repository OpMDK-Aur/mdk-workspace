'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

export interface ClienteOption {
  id: string
  nombre_del_negocio: string
}

interface ClientPickerProps {
  clientes: ClienteOption[]
  value: string | null
  onChange: (cliente: ClienteOption | null) => void
  placeholder?: string
  allowClear?: boolean
  size?: 'sm' | 'default'
  className?: string
}

export function ClientPicker({ clientes, value, onChange, placeholder = 'Elegir cliente', allowClear, size = 'default', className }: ClientPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = clientes.find((c) => c.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size={size === 'sm' ? 'sm' : 'default'}
          className={cn('justify-between gap-2 rounded-full font-normal', size === 'sm' && 'h-7 px-3 text-xs', className)}
        >
          <span className="truncate">{selected?.nombre_del_negocio ?? placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente..." />
          <CommandList>
            <CommandEmpty>No encontramos ese cliente.</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem value="__ninguno" onSelect={() => { onChange(null); setOpen(false) }}>
                  Todos los clientes
                </CommandItem>
              )}
              {clientes.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.nombre_del_negocio} ${c.id}`}
                  onSelect={() => { onChange(c); setOpen(false) }}
                >
                  <Check className={cn('h-4 w-4', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  {c.nombre_del_negocio}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
