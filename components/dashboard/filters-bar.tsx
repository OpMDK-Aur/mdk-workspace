'use client'

import { useState, useEffect, useRef } from 'react'
import type { Client, DashboardFilters, Platform, DateRangePreset } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Calendar } from '@/components/ui/calendar'
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, Calendar as CalendarIcon, Users, Monitor, Layers } from 'lucide-react'
import type { DateRange as DayPickerDateRange } from 'react-day-picker'

interface AdAccount {
  id: string
  name: string
  platform: 'meta' | 'google'
}

interface RemoteAccount {
  id: string
  name: string
}

interface DashboardFiltersBarProps {
  clients: Client[]
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
}

const platformOptions: { value: Platform; label: string }[] = [
  { value: 'all', label: 'Todas las plataformas' },
  { value: 'meta', label: 'Meta Ads' },
  { value: 'google', label: 'Google Ads' },
]

const datePresets: { value: DateRangePreset; label: string }[] = [
  { value: 'last_30d', label: 'Ultimos 30 dias' },
  { value: 'last_14d', label: 'Ultimos 14 dias' },
  { value: 'last_7d', label: 'Ultimos 7 dias' },
  { value: 'daily', label: 'Hoy' },
  { value: 'monthly', label: 'Este mes' },
  { value: 'yearly', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
]

function getDateRangeFromPreset(preset: DateRangePreset): { start: string; end: string } {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  switch (preset) {
    case 'last_7d':  return { start: fmt(subDays(today, 7)), end: fmt(today) }
    case 'last_14d': return { start: fmt(subDays(today, 14)), end: fmt(today) }
    case 'last_30d': return { start: fmt(subDays(today, 30)), end: fmt(today) }
    case 'daily':    return { start: fmt(today), end: fmt(today) }
    case 'monthly':  return { start: fmt(startOfMonth(today)), end: fmt(endOfMonth(today)) }
    case 'yearly':   return { start: fmt(startOfYear(today)), end: fmt(endOfYear(today)) }
    default:         return { start: fmt(subDays(today, 30)), end: fmt(today) }
  }
}

function getDateLabel(filters: DashboardFilters): string {
  const preset = datePresets.find(p => p.value === filters.dateRange.preset)
  if (filters.dateRange.preset === 'custom' && filters.dateRange.start && filters.dateRange.end) {
    return `${filters.dateRange.start} - ${filters.dateRange.end}`
  }
  return preset?.label || 'Ultimos 30 dias'
}

function buildAdAccounts(
  clients: Client[],
  platform: Platform,
  nameMap: Map<string, string>,
): AdAccount[] {
  const accounts: AdAccount[] = []
  const seen = new Set<string>()

  for (const client of clients) {
    if ((platform === 'all' || platform === 'meta') && client.meta_ads_account_id) {
      for (const id of client.meta_ads_account_id.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!seen.has(id)) {
          seen.add(id)
          const realName = nameMap.get(id) ?? `${client.business_name} (Meta)`
          accounts.push({ id, name: realName, platform: 'meta' })
        }
      }
    }
    if ((platform === 'all' || platform === 'google') && client.google_ads_customer_id) {
      for (const id of client.google_ads_customer_id.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!seen.has(id)) {
          seen.add(id)
          const realName = nameMap.get(id) ?? `${client.business_name} (Google)`
          accounts.push({ id, name: realName, platform: 'google' })
        }
      }
    }
  }

  return accounts.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function DashboardFiltersBar({ clients, filters, onChange }: DashboardFiltersBarProps) {
  const [customRange, setCustomRange] = useState<DayPickerDateRange | undefined>(undefined)
  const [showCustomCalendar, setShowCustomCalendar] = useState(false)
  const [dateMenuOpen, setDateMenuOpen] = useState(false)
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map())
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    async function loadAccountNames() {
      const map = new Map<string, string>()
      try {
        const [metaRes, googleRes] = await Promise.allSettled([
          fetch('/api/ads/meta/accounts').then(r => r.json()),
          fetch('/api/ads/google/accounts').then(r => r.json()),
        ])
        if (metaRes.status === 'fulfilled' && !metaRes.value.error) {
          for (const acc of (metaRes.value.accounts ?? []) as RemoteAccount[]) {
            map.set(acc.id, acc.name)
          }
        }
        if (googleRes.status === 'fulfilled' && !googleRes.value.error) {
          for (const acc of (googleRes.value.accounts ?? []) as RemoteAccount[]) {
            map.set(acc.id, acc.name)
          }
        }
      } catch {
        // silently ignore — fallback names will be used
      }
      setNameMap(map)
    }

    loadAccountNames()
  }, [])

  const currentPlatform = platformOptions.find(p => p.value === filters.platform) || platformOptions[0]
  const selectedCount = filters.clientIds.length
  const allSelected = selectedCount === 0

  const visibleClients = filters.clientIds.length > 0
    ? clients.filter(c => filters.clientIds.includes(c.id))
    : clients

  const adAccounts = buildAdAccounts(visibleClients, filters.platform, nameMap)
  const selectedAccount = adAccounts.find(a => a.id === filters.adAccountId)

  useEffect(() => {
    if (filters.adAccountId && !adAccounts.find(a => a.id === filters.adAccountId)) {
      onChange({ ...filters, adAccountId: null })
    }
  }, [filters.platform, filters.clientIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlatformChange = (platform: Platform) => {
    onChange({ ...filters, platform, adAccountId: null })
  }

  const handleClientToggle = (clientId: string) => {
    const next = filters.clientIds.includes(clientId)
      ? filters.clientIds.filter(id => id !== clientId)
      : [...filters.clientIds, clientId]
    onChange({ ...filters, clientIds: next, adAccountId: null })
  }

  const handleSelectAllClients = () => {
    onChange({ ...filters, clientIds: [], adAccountId: null })
  }

  const handleCustomDateApply = () => {
    if (customRange?.from && customRange?.to) {
      onChange({
        ...filters,
        dateRange: {
          preset: 'custom',
          start: format(customRange.from, 'yyyy-MM-dd'),
          end: format(customRange.to, 'yyyy-MM-dd'),
        },
      })
      setShowCustomCalendar(false)
      setDateMenuOpen(false)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Platform selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Monitor className="h-4 w-4" />
            <span className="text-sm">{currentPlatform.label}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {platformOptions.map(p => (
            <DropdownMenuItem
              key={p.value}
              onClick={() => handlePlatformChange(p.value)}
              className={cn(filters.platform === p.value && 'bg-muted')}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Client multi-selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Users className="h-4 w-4" />
            <span className="text-sm">
              {allSelected ? 'Todos los clientes' : `${selectedCount} cliente${selectedCount !== 1 ? 's' : ''}`}
            </span>
            {!allSelected && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">{selectedCount}</Badge>
            )}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 max-h-80 overflow-y-auto">
          <DropdownMenuItem onClick={handleSelectAllClients} className={cn(allSelected && 'bg-muted')}>
            <span className="font-medium">Todos los clientes</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {clients.map(client => (
            <DropdownMenuCheckboxItem
              key={client.id}
              checked={filters.clientIds.includes(client.id)}
              onCheckedChange={() => handleClientToggle(client.id)}
            >
              {client.business_name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Ad account selector — visible only when there are 2+ accounts */}
      {adAccounts.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn('h-9 gap-2', filters.adAccountId && 'border-primary/50 text-primary')}
            >
              <Layers className="h-4 w-4" />
              <span className="text-sm">
                {selectedAccount ? selectedAccount.name : 'Todas las cuentas'}
              </span>
              {filters.adAccountId && (
                <Badge className="h-4 px-1 text-[10px] bg-primary/15 text-primary border-primary/20">1</Badge>
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-h-72 overflow-y-auto">
            <DropdownMenuItem
              onClick={() => onChange({ ...filters, adAccountId: null })}
              className={cn(!filters.adAccountId && 'bg-muted')}
            >
              <span className="font-medium">Todas las cuentas</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {adAccounts.map(acc => (
              <DropdownMenuItem
                key={acc.id}
                onClick={() => onChange({ ...filters, adAccountId: acc.id })}
                className={cn(filters.adAccountId === acc.id && 'bg-muted')}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{acc.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{acc.id}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Date range selector */}
      <DropdownMenu open={dateMenuOpen} onOpenChange={(open) => {
        setDateMenuOpen(open)
        if (!open) setShowCustomCalendar(false)
      }}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <CalendarIcon className="h-4 w-4" />
            <span className="text-sm">{getDateLabel(filters)}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto p-0">
          {!showCustomCalendar ? (
            <div className="w-52 p-1">
              {datePresets.map(preset => (
                <DropdownMenuItem
                  key={preset.value}
                  className={cn('cursor-pointer', filters.dateRange.preset === preset.value && preset.value !== 'custom' && 'bg-muted')}
                  onSelect={(e) => {
                    if (preset.value === 'custom') {
                      e.preventDefault()
                      setShowCustomCalendar(true)
                    } else {
                      const { start, end } = getDateRangeFromPreset(preset.value)
                      onChange({ ...filters, dateRange: { preset: preset.value, start, end } })
                      setDateMenuOpen(false)
                    }
                  }}
                >
                  {preset.label}
                </DropdownMenuItem>
              ))}
            </div>
          ) : (
            <div className="p-0">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs px-2" onClick={() => setShowCustomCalendar(false)}>
                  &larr; Volver
                </Button>
                <span className="text-sm font-medium text-muted-foreground">Rango personalizado</span>
              </div>
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={setCustomRange}
                locale={es}
                numberOfMonths={2}
                className="p-3"
              />
              <div className="flex items-center justify-end gap-2 px-3 pb-3">
                <Button size="sm" onClick={handleCustomDateApply} disabled={!customRange?.from || !customRange?.to}>
                  Aplicar
                </Button>
              </div>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
