'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'

interface ClientAccount {
  plataforma: string | null
}

export interface AnalyzableClient {
  id: string
  nombre_del_negocio: string
  cuentas_publicitarias: ClientAccount[]
}

function platformLabel(plataforma: string | null) {
  const key = (plataforma ?? '').toLowerCase()
  if (key === 'google') return 'Google Ads'
  if (key === 'meta') return 'Meta Ads'
  return plataforma ?? 'Plataforma'
}

interface ClientSelectorProps {
  value: AnalyzableClient | null
  onChange: (client: AnalyzableClient | null) => void
}

export function ClientSelector({ value, onChange }: ClientSelectorProps) {
  const [clients, setClients] = useState<AnalyzableClient[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function fetchClients() {
      const supabase = createClient()
      // Only clients with at least one row in cuentas_publicitarias (INNER JOIN via embed).
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio, cuentas_publicitarias!inner(plataforma)')
        .order('nombre_del_negocio')

      if (!isMounted) return

      if (error) {
        console.error('[v0] ClientSelector fetch failed:', error.message)
        setLoadError('No se pudo cargar la lista de clientes.')
        setLoading(false)
        return
      }

      setClients((data ?? []) as unknown as AnalyzableClient[])
      setLoading(false)
    }

    fetchClients()
    return () => {
      isMounted = false
    }
  }, [])

  const platforms = value
    ? Array.from(new Set(value.cuentas_publicitarias.map((account) => account.plataforma).filter(Boolean)))
    : []

  return (
    <div className="flex flex-col gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between sm:w-[360px]"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Cargando clientes…
              </span>
            ) : (
              value?.nombre_del_negocio || 'Seleccionar cliente…'
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0">
          <Command>
            <CommandInput placeholder="Buscar cliente…" />
            <CommandList>
              <CommandEmpty>{loadError || 'No se encontraron clientes con cuentas publicitarias.'}</CommandEmpty>
              <CommandGroup>
                {clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.nombre_del_negocio}
                    onSelect={() => {
                      onChange(client)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn('mr-2 size-4', value?.id === client.id ? 'opacity-100' : 'opacity-0')}
                      aria-hidden="true"
                    />
                    {client.nombre_del_negocio}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{value.nombre_del_negocio}</span>
          {platforms.length > 0 ? (
            platforms.map((platform) => (
              <Badge key={platform} variant="secondary">
                {platformLabel(platform)}
              </Badge>
            ))
          ) : (
            <Badge variant="outline">Sin plataformas activas</Badge>
          )}
        </div>
      )}
    </div>
  )
}
