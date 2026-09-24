'use client'

import { useState, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Client } from '@/lib/types'

interface DashboardHeaderProps {
  clients: Client[]
  selectedClientId: string | null
  onSelectClient: (clientId: string | null) => void
}

export function DashboardHeader({
  clients,
  selectedClientId,
  onSelectClient,
}: DashboardHeaderProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const visibleClients = useMemo(() => {
    if (!pathname.startsWith('/conexa')) return clients
    return clients.filter((client) => ['ICS Salud', 'VN Global', 'Soy Aurelia'].includes(client.nombre_del_negocio))
  }, [clients, pathname])

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null
    return visibleClients.find((client) => client.id === selectedClientId)
  }, [selectedClientId, visibleClients])

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="flex items-center justify-between px-6 py-3 gap-4">
        {/* Left side - Departamento/Cliente selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Departamento</span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-8 gap-2 text-sm',
                  selectedClientId && 'border-primary/50 bg-primary/5 text-primary font-medium'
                )}
              >
                <Building2 className="h-4 w-4" />
                {selectedClient?.nombre_del_negocio || 'Todos los clientes'}
                <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-auto" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Seleccionar cliente</p>
              </div>
              <Command>
                {visibleClients.length > 6 && <CommandInput placeholder="Buscar cliente..." className="h-8 text-sm" />}
                <CommandList className={cn(visibleClients.length > 6 ? 'max-h-64 overflow-y-auto' : 'overflow-hidden')}>
                  <CommandEmpty className="text-xs text-muted-foreground py-4 text-center">
                    Sin resultados
                  </CommandEmpty>
                  <CommandGroup>
                    {!pathname.startsWith('/conexa') && (
                      <CommandItem
                        value="todos los clientes"
                        onSelect={() => {
                          onSelectClient(null)
                          setOpen(false)
                        }}
                        className="text-sm flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                      >
                        <span className="flex-1">Todos los clientes</span>
                      </CommandItem>
                    )}
                    {visibleClients.map((client) => {
                      const selected = selectedClientId === client.id
                      return (
                        <CommandItem
                          key={client.id}
                          value={client.nombre_del_negocio}
                          onSelect={() => {
                            onSelectClient(client.id)
                            setOpen(false)
                          }}
                          className="text-sm flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                        >
                          <div className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                          )}>
                            {selected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="flex-1 truncate">{client.nombre_del_negocio}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Right side - Empty for now, can add more controls */}
        <div />
      </div>
    </div>
  )
}
