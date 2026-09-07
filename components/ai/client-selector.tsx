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

export interface ClientAccount {
  id_cuenta: string | null
  nombre_cuenta: string | null
  plataforma: string | null
  activo?: boolean | null
}

export interface AnalyzableClient {
  id: string
  nombre_del_negocio: string
  cuentas_publicitarias: ClientAccount[]
  meta_ads_account_id?: string | null
  google_ads_customer_id?: string | null
  analytics_property_id?: string | null
  tag_manager_container_id?: string | null
  crm_type?: string | null
}

function platformLabel(plataforma: string | null) {
  const key = (plataforma ?? '').toLowerCase()
  if (key === 'google') return 'Google Ads'
  if (key === 'meta') return 'Meta Ads'
  if (key === 'analytics') return 'Google Analytics'
  if (key === 'tag_manager') return 'Tag Manager'
  if (key === 'crm') return 'CRM'
  return plataforma ?? 'Plataforma'
}

interface ClientSelectorProps {
  value: AnalyzableClient | null
  onChange: (client: AnalyzableClient | null) => void
  /** Se dispara cada vez que cambia la selección de cuentas publicitarias, para que el chat filtre por ellas. */
  onAccountsChange?: (accounts: ClientAccount[]) => void
}

export function ClientSelector({ value, onChange, onAccountsChange }: ClientSelectorProps) {
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
        .select('id, nombre_del_negocio, meta_ads_account_id, google_ads_customer_id, analytics_property_id, tag_manager_container_id, crm_type, cuentas_publicitarias!inner(id_cuenta, nombre_cuenta, plataforma, activo)')
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

  const [resolvedAccounts, setResolvedAccounts] = useState<ClientAccount[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<ClientAccount[]>([])
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [accountOpen, setAccountOpen] = useState(false)

  useEffect(() => {
    let active = true
    setSelectedAccounts([])
    setResolvedAccounts([])
    setSelectedPlatforms(value ? [
      ...(value.meta_ads_account_id ? ['Meta Ads'] : []),
      ...(value.google_ads_customer_id ? ['Google Ads'] : []),
      ...(value.analytics_property_id ? ['Google Analytics'] : []),
      ...(value.tag_manager_container_id ? ['Tag Manager'] : []),
      ...(value.crm_type ? ['CRM'] : []),
    ] : [])
    if (!value?.id) return () => { active = false }
    fetch(`/api/agentes/analista/cuentas?clientId=${encodeURIComponent(value.id)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudieron cargar las cuentas')))
      .then((payload) => { if (active) setResolvedAccounts(payload.cuentas ?? []) })
      .catch((error) => console.error('[v0] Advertising accounts fetch failed:', error))
    return () => { active = false }
  }, [value?.id])

  // Notifica al padre en cada cambio de selección (incluido el reset al
  // cambiar de cliente) para que el chat pueda filtrar por estas cuentas.
  useEffect(() => {
    onAccountsChange?.(selectedAccounts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccounts])

  const integrationAccounts: ClientAccount[] = value ? [
    ...(value.analytics_property_id ? [{ id_cuenta: value.analytics_property_id, nombre_cuenta: 'Google Analytics 4', plataforma: 'analytics', activo: true }] : []),
    ...(value.tag_manager_container_id ? [{ id_cuenta: value.tag_manager_container_id, nombre_cuenta: 'Google Tag Manager', plataforma: 'tag_manager', activo: true }] : []),
    ...(value.crm_type ? [{ id_cuenta: value.crm_type, nombre_cuenta: 'CRM conectado', plataforma: 'crm', activo: true }] : []),
  ] : []

  const accounts = [...(resolvedAccounts.length > 0 ? resolvedAccounts : value?.cuentas_publicitarias ?? []), ...integrationAccounts]
    .filter((account) => account.id_cuenta)
    .filter((account) => selectedPlatforms.length === 0 || selectedPlatforms.includes(platformLabel(account.plataforma)))

  const togglePlatform = (label: string) => {
    setSelectedPlatforms((current) => {
      const next = current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
      if (!next.includes(label)) {
        setSelectedAccounts((accounts) => accounts.filter((account) => platformLabel(account.plataforma) !== label))
      }
      return next
    })
  }

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
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Cuenta publicitaria</span>
          <Popover open={accountOpen} onOpenChange={setAccountOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={accountOpen} className="w-full justify-between sm:w-[360px]" disabled={accounts.length === 0}>
                {selectedAccounts.length ? `${selectedAccounts.length} plataforma${selectedAccounts.length === 1 ? '' : 's'} seleccionada${selectedAccounts.length === 1 ? '' : 's'}` : accounts.length ? 'Seleccionar cuentas y plataformas…' : 'Sin cuentas o plataformas configuradas'}
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0">
              <Command>
                <CommandInput placeholder="Buscar por nombre o ID…" />
                <CommandList>
                  <CommandEmpty>No se encontraron cuentas.</CommandEmpty>
                  <CommandGroup>
                    {accounts.map((account) => {
                      const label = `${account.nombre_cuenta || 'Sin nombre'} ${account.id_cuenta}`
                      return <CommandItem key={`${account.plataforma}-${account.id_cuenta}`} value={label} onSelect={() => { setSelectedAccounts((current) => current.some((item) => item.id_cuenta === account.id_cuenta && item.plataforma === account.plataforma) ? current.filter((item) => !(item.id_cuenta === account.id_cuenta && item.plataforma === account.plataforma)) : [...current, account]) }}><Check className={cn('mr-2 size-4', selectedAccounts.some((item) => item.id_cuenta === account.id_cuenta && item.plataforma === account.plataforma) ? 'opacity-100' : 'opacity-0')} aria-hidden="true" /><span className="flex flex-col"><span>{account.nombre_cuenta || 'Sin nombre'}</span><span className="font-mono text-xs text-muted-foreground">{account.id_cuenta} · {platformLabel(account.plataforma)}</span></span></CommandItem>
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{value.nombre_del_negocio}</span>
            {[
              { label: 'Meta Ads', connected: Boolean(value.meta_ads_account_id) },
              { label: 'Google Ads', connected: Boolean(value.google_ads_customer_id) },
              { label: 'Google Analytics', connected: Boolean(value.analytics_property_id) },
              { label: 'Tag Manager', connected: Boolean(value.tag_manager_container_id) },
              { label: 'CRM', connected: Boolean(value.crm_type) },
            ].map((platform) => (
              <button
                key={platform.label}
                type="button"
                onClick={() => platform.connected && togglePlatform(platform.label)}
                disabled={!platform.connected}
                aria-pressed={platform.connected && selectedPlatforms.includes(platform.label)}
                aria-label={`${platform.label}: ${platform.connected && selectedPlatforms.includes(platform.label) ? 'seleccionada' : 'no seleccionada'}`}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    'cursor-pointer transition-colors',
                    platform.connected && selectedPlatforms.includes(platform.label)
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : platform.connected
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'border-muted-foreground/20 text-muted-foreground opacity-60',
                  )}
                >
                  <span className={cn('mr-1.5 size-1.5 rounded-full', platform.connected && selectedPlatforms.includes(platform.label) ? 'bg-emerald-500' : platform.connected ? 'bg-amber-500' : 'bg-muted-foreground/40')} aria-hidden="true" />
                  {platform.label}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
