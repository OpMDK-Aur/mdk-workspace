'use client'

import { useState, useMemo, useEffect } from 'react'
import type { ScorecardRow, Client } from '@/lib/types'
import {
  type AlertaConfigurada,
  type AlertaCategoria,
  type BaselineCliente,
  evaluarAlerta,
  getAlertaMeta,
} from '@/lib/controller-alertas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertTriangle,
  Search,
  TrendingUp,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Info,
  CalendarDays,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import type { DateRange as DayPickerDateRange } from 'react-day-picker'

// ── Date Presets ──────────────────────────────────────────────────────────────

type AlertDatePreset = 'last_14d' | 'last_7d' | 'yesterday' | 'today' | 'custom'

interface AlertDateRange {
  preset: AlertDatePreset
  start: string
  end: string
}

const DATE_PRESETS: { value: AlertDatePreset; label: string }[] = [
  { value: 'last_14d',   label: 'Últimos 14 días' },
  { value: 'last_7d',    label: 'Últimos 7 días' },
  { value: 'yesterday',  label: 'Ayer' },
  { value: 'today',      label: 'Hoy' },
  { value: 'custom',     label: 'Personalizado' },
]

function buildAlertDateRange(preset: AlertDatePreset, customStart?: string, customEnd?: string): AlertDateRange {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  switch (preset) {
    case 'last_14d':   return { preset, start: fmt(subDays(today, 14)), end: fmt(today) }
    case 'last_7d':    return { preset, start: fmt(subDays(today, 7)),  end: fmt(today) }
    case 'yesterday': { const y = subDays(today, 1); return { preset, start: fmt(y), end: fmt(y) } }
    case 'today':      return { preset, start: fmt(today), end: fmt(today) }
    case 'custom':     return { preset, start: customStart ?? fmt(subDays(today, 14)), end: customEnd ?? fmt(today) }
    default:           return { preset: 'last_14d', start: fmt(subDays(today, 14)), end: fmt(today) }
  }
}

// ── Alert Types ───────────────────────────────────────────────────────────────

type AlertSeverity = 'critical' | 'warning' | 'info'

interface CampaignAlert {
  id: string
  clientId: string
  clientName: string
  campaignId: string
  campaignName: string
  platform: 'meta' | 'google'
  subtipo: string
  categoria: AlertaCategoria
  badgeLabel: string
  severity: AlertSeverity
  message: string
}

interface ClientAlertGroup {
  clientId: string
  clientName: string
  alerts: CampaignAlert[]
  criticalCount: number
  warningCount: number
}

// ── Config ────────────────────────────────────────────────────────────────────

const CATEGORIA_BADGE: Record<AlertaCategoria, {
  icon: React.ReactNode
  color: string
  bgColor: string
}> = {
  rendimiento: {
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  presupuesto: {
    icon: <DollarSign className="h-3.5 w-3.5" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
}

const SEVERITY_CONFIG: Record<AlertSeverity, {
  label: string
  color: string
  bgColor: string
  dotColor: string
}> = {
  critical: {
    label: 'Critico',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    dotColor: 'bg-red-500',
  },
  warning: {
    label: 'Atencion',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    dotColor: 'bg-amber-500',
  },
  info: {
    label: 'Info',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    dotColor: 'bg-blue-500',
  },
}

// ── Alert Detection (basada en la configuración del Controller) ─────────────────

// Calcula promedios de referencia por cliente para las alertas comparativas
function buildBaselines(rows: ScorecardRow[]): Map<string, BaselineCliente> {
  const acc = new Map<string, {
    cplSum: number; cplN: number
    ctrSum: number; ctrN: number
    spendSum: number; spendN: number
    tasaSum: number; tasaN: number
  }>()

  for (const row of rows) {
    if (!acc.has(row.clientId)) {
      acc.set(row.clientId, { cplSum: 0, cplN: 0, ctrSum: 0, ctrN: 0, spendSum: 0, spendN: 0, tasaSum: 0, tasaN: 0 })
    }
    const a = acc.get(row.clientId)!
    if (row.cpl > 0) { a.cplSum += row.cpl; a.cplN++ }
    if (row.impressions > 0) { a.ctrSum += row.ctr; a.ctrN++ }
    if (row.spend > 0) { a.spendSum += row.spend; a.spendN++ }
    if (row.clicks > 0) { a.tasaSum += row.leads / row.clicks; a.tasaN++ }
  }

  const result = new Map<string, BaselineCliente>()
  for (const [clientId, a] of acc.entries()) {
    result.set(clientId, {
      cplPromedio: a.cplN > 0 ? a.cplSum / a.cplN : 0,
      ctrPromedio: a.ctrN > 0 ? a.ctrSum / a.ctrN : 0,
      spendPromedio: a.spendN > 0 ? a.spendSum / a.spendN : 0,
      tasaConversionPromedio: a.tasaN > 0 ? a.tasaSum / a.tasaN : 0,
    })
  }
  return result
}

function platformMatches(plataforma: string, rowPlatform: 'meta' | 'google'): boolean {
  return plataforma === 'ambas' || plataforma === rowPlatform
}

function detectAlerts(
  rows: ScorecardRow[],
  configuredAlerts: AlertaConfigurada[]
): CampaignAlert[] {
  const alerts: CampaignAlert[] = []

  // Solo alertas activas, agrupadas por cliente
  const activasPorCliente = new Map<string, AlertaConfigurada[]>()
  for (const alerta of configuredAlerts) {
    if (!alerta.activa) continue
    if (!activasPorCliente.has(alerta.cliente_id)) activasPorCliente.set(alerta.cliente_id, [])
    activasPorCliente.get(alerta.cliente_id)!.push(alerta)
  }

  if (activasPorCliente.size === 0) return alerts

  const baselines = buildBaselines(rows)

  for (const row of rows) {
    const configs = activasPorCliente.get(row.clientId)
    if (!configs || configs.length === 0) continue // cliente sin configuración → no se muestra

    const campaignId = row.campaignId || `${row.clientId}-${row.platform}`
    const campaignName = row.campaignName || `${row.platform} Ads`
    const baseline = baselines.get(row.clientId) || {
      cplPromedio: 0, ctrPromedio: 0, spendPromedio: 0, tasaConversionPromedio: 0,
    }

    const metrica = {
      cpl: row.cpl,
      ctr: row.ctr,
      leads: row.leads,
      clicks: row.clicks,
      impressions: row.impressions,
      spend: row.spend,
      budget: row.budget,
    }

    for (const config of configs) {
      if (!platformMatches(config.plataforma, row.platform)) continue

      const resultado = evaluarAlerta(config.subtipo, config.parametros || {}, metrica, baseline)
      if (!resultado.disparada) continue

      const meta = getAlertaMeta(config.subtipo)
      alerts.push({
        id: `${campaignId}-${config.subtipo}`,
        clientId: row.clientId,
        clientName: row.clientName,
        campaignId,
        campaignName,
        platform: row.platform,
        subtipo: config.subtipo,
        categoria: meta?.categoria ?? 'rendimiento',
        badgeLabel: meta?.badgeLabel ?? config.subtipo,
        severity: resultado.severidad,
        message: resultado.mensaje,
      })
    }
  }

  return alerts
}

// ── Components ────────────────────────────────────────────────────────────────

function AlertTypeBadge({ categoria, badgeLabel }: { categoria: AlertaCategoria; badgeLabel: string }) {
  const config = CATEGORIA_BADGE[categoria]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
      config.bgColor, config.color
    )}>
      {config.icon}
      {badgeLabel}
    </span>
  )
}

function SeverityDot({ severity }: { severity: AlertSeverity }) {
  const config = SEVERITY_CONFIG[severity]
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger>
          <span className={cn('h-2 w-2 rounded-full shrink-0', config.dotColor)} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PlatformBadge({ platform }: { platform: 'meta' | 'google' }) {
  return platform === 'meta' ? (
    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-400/30 text-blue-400 bg-blue-500/5">
      Meta
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-green-400/30 text-green-400 bg-green-500/5">
      Google
    </Badge>
  )
}

function ClientAlertRow({ group, expanded, onToggle }: { 
  group: ClientAlertGroup
  expanded: boolean
  onToggle: () => void
}) {
  const totalAlerts = group.alerts.length
  const hasCritical = group.criticalCount > 0

  return (
    <div className={cn(
      'rounded-lg border transition-all',
      hasCritical ? 'border-red-500/30 bg-red-500/5' : 'border-border/50'
    )}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
      >
        <div className={cn(
          'h-2.5 w-2.5 rounded-full shrink-0',
          hasCritical ? 'bg-red-500' : group.warningCount > 0 ? 'bg-amber-500' : 'bg-blue-500'
        )} />
        
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-foreground truncate">{group.clientName}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {group.criticalCount > 0 && (
            <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
              {group.criticalCount} critico{group.criticalCount !== 1 ? 's' : ''}
            </span>
          )}
          {group.warningCount > 0 && (
            <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {group.warningCount} alerta{group.warningCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{totalAlerts} total</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded alerts */}
      {expanded && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          {group.alerts.map((alert) => (
            <div 
              key={alert.id} 
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <SeverityDot severity={alert.severity} />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-medium text-foreground truncate max-w-[200px]">
                    {alert.campaignName}
                  </p>
                  <PlatformBadge platform={alert.platform} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{alert.message}</p>
              </div>

              <AlertTypeBadge categoria={alert.categoria} badgeLabel={alert.badgeLabel} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Filter Options ────────────────────────────────────────────────────────────

type FilterOption = 'all' | 'critical' | 'warning' | 'rendimiento' | 'presupuesto'

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'critical', label: 'Criticas' },
  { value: 'warning', label: 'Atencion' },
  { value: 'rendimiento', label: 'Rendimiento' },
  { value: 'presupuesto', label: 'Presupuesto' },
]

// ── Main Component ─────────────────────────────��────────────────────────��─────

interface CampaignAlertsPanelProps {
  rows: ScorecardRow[]
  clients: Client[]
  loading?: boolean
  onDateRangeChange?: (range: { preset: string; start: string; end: string }) => void
  // Cambia este valor para forzar recarga de la configuración (p.ej. botón Actualizar)
  refreshKey?: number
}

export function CampaignAlertsPanel({ rows, clients, loading, onDateRangeChange, refreshKey = 0 }: CampaignAlertsPanelProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterOption>('all')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [dateRange, setDateRange] = useState<AlertDateRange>(() => buildAlertDateRange('last_14d'))
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarSelection, setCalendarSelection] = useState<DayPickerDateRange | undefined>(undefined)
  
  // Campaign selection with localStorage persistence
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const saved = localStorage.getItem('campaign-alerts-selection')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  const [campaignSearch, setCampaignSearch] = useState('')
  
  // Sync to localStorage whenever selection changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('campaign-alerts-selection', JSON.stringify(Array.from(selectedCampaignIds)))
    }
  }, [selectedCampaignIds])

  function handlePresetChange(preset: AlertDatePreset) {
    if (preset === 'custom') {
      setCalendarOpen(true)
      return
    }
    const range = buildAlertDateRange(preset)
    setDateRange(range)
    onDateRangeChange?.(range)
  }

  function handleCalendarSelect(sel: DayPickerDateRange | undefined) {
    setCalendarSelection(sel)
    if (sel?.from && sel?.to) {
      const range = buildAlertDateRange('custom', format(sel.from, 'yyyy-MM-dd'), format(sel.to, 'yyyy-MM-dd'))
      setDateRange(range)
      onDateRangeChange?.(range)
      setCalendarOpen(false)
    }
  }

  // Campaign selection handlers
  function handleToggleCampaign(campaignId: string) {
    setSelectedCampaignIds(prev => {
      const next = new Set(prev)
      if (next.has(campaignId)) {
        next.delete(campaignId)
      } else {
        next.add(campaignId)
      }
      return next
    })
  }

  function handleSelectAll() {
    const allIds = new Set(rows.map(r => r.campaignId).filter((id): id is string => id != null))
    setSelectedCampaignIds(allIds)
  }

  function handleClearSelection() {
    setSelectedCampaignIds(new Set())
  }

  // Get unique campaigns grouped by client
  const campaignsByClient = useMemo(() => {
    const grouped = new Map<string, Array<{ id: string; name: string; platform: string }>>()
    const clientNames = new Map<string, string>()
    
    for (const row of rows) {
      if (!row.campaignId) continue
      
      if (!grouped.has(row.clientId)) {
        grouped.set(row.clientId, [])
        clientNames.set(row.clientId, row.clientName)
      }
      
      // Avoid duplicates
      const campaigns = grouped.get(row.clientId)!
      if (!campaigns.find(c => c.id === row.campaignId)) {
        campaigns.push({
          id: row.campaignId,
          name: row.campaignName ?? `${row.platform} Ads`,
          platform: row.platform,
        })
      }
    }
    
    return { grouped, clientNames }
  }, [rows])

  // Cargar la configuración de alertas del Controller (todos los clientes, solo activas)
  const [configuredAlerts, setConfiguredAlerts] = useState<AlertaConfigurada[]>([])
  const [configLoading, setConfigLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setConfigLoading(true)
    fetch('/api/controller/alertas?all=true&activas=true')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setConfiguredAlerts(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setConfiguredAlerts([])
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // Filter rows based on selected campaigns
  // Empty set = show all campaigns (default)
  const filteredRows = useMemo(() => {
    if (selectedCampaignIds.size === 0) return rows
    return rows.filter(r => selectedCampaignIds.has(r.campaignId ?? ''))
  }, [rows, selectedCampaignIds])

  // Detect all alerts using filtered rows + configuración del paid media
  const allAlerts = useMemo(() => detectAlerts(filteredRows, configuredAlerts), [filteredRows, configuredAlerts])

  // Group alerts by client
  const groupedAlerts = useMemo(() => {
    const groups = new Map<string, ClientAlertGroup>()
    
    for (const alert of allAlerts) {
      if (!groups.has(alert.clientId)) {
        groups.set(alert.clientId, {
          clientId: alert.clientId,
          clientName: alert.clientName,
          alerts: [],
          criticalCount: 0,
          warningCount: 0,
        })
      }
      const group = groups.get(alert.clientId)!
      group.alerts.push(alert)
      if (alert.severity === 'critical') group.criticalCount++
      if (alert.severity === 'warning') group.warningCount++
    }

    return Array.from(groups.values())
  }, [allAlerts])

  // Apply filters
  const filteredGroups = useMemo(() => {
    let result = groupedAlerts

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(g => 
        g.clientName.toLowerCase().includes(q) ||
        g.alerts.some(a => a.campaignName.toLowerCase().includes(q))
      )
    }

    // Type filter
    if (filter !== 'all') {
      result = result.map(g => {
        let filteredAlerts = g.alerts
        
        if (filter === 'critical') {
          filteredAlerts = g.alerts.filter(a => a.severity === 'critical')
        } else if (filter === 'warning') {
          filteredAlerts = g.alerts.filter(a => a.severity === 'warning')
        } else if (filter === 'rendimiento') {
          filteredAlerts = g.alerts.filter(a => a.categoria === 'rendimiento')
        } else if (filter === 'presupuesto') {
          filteredAlerts = g.alerts.filter(a => a.categoria === 'presupuesto')
        }

        return {
          ...g,
          alerts: filteredAlerts,
          criticalCount: filteredAlerts.filter(a => a.severity === 'critical').length,
          warningCount: filteredAlerts.filter(a => a.severity === 'warning').length,
        }
      }).filter(g => g.alerts.length > 0)
    }

    // Sort: most critical first
    result.sort((a, b) => {
      if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount
      if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount
      return b.alerts.length - a.alerts.length
    })

    return result
  }, [groupedAlerts, search, filter])

  const toggleClient = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
      }
      return next
    })
  }

  const totalCritical = allAlerts.filter(a => a.severity === 'critical').length
  const totalWarning = allAlerts.filter(a => a.severity === 'warning').length
  const totalAlerts = allAlerts.length

  // Don't render if no alerts (una vez cargados datos y configuración)
  if (!loading && !configLoading && totalAlerts === 0) {
    return null
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
              totalCritical > 0 ? 'bg-red-500/10' : totalWarning > 0 ? 'bg-amber-500/10' : 'bg-muted'
            )}>
              <AlertTriangle className={cn(
                'h-4.5 w-4.5',
                totalCritical > 0 ? 'text-red-400' : totalWarning > 0 ? 'text-amber-400' : 'text-muted-foreground'
              )} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Alertas de Campanas</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                {totalCritical > 0 && (
                  <span className="text-[10px] text-red-400 font-semibold">
                    {totalCritical} critica{totalCritical !== 1 ? 's' : ''}
                  </span>
                )}
                {totalWarning > 0 && (
                  <span className="text-[10px] text-amber-400 font-semibold">
                    {totalWarning} atencion
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {totalAlerts} total en {filteredGroups.length} cliente{filteredGroups.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="relative w-full sm:w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente o campana..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Date presets + filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {/* Date presets */}
          {DATE_PRESETS.filter(p => p.value !== 'custom').map(preset => (
            <button
              key={preset.value}
              onClick={() => handlePresetChange(preset.value)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all',
                dateRange.preset === preset.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
              )}
            >
              {preset.label}
            </button>
          ))}

          {/* Custom date picker */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  dateRange.preset === 'custom'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
                )}
              >
                <CalendarDays className="h-3 w-3" />
                {dateRange.preset === 'custom'
                  ? `${format(new Date(dateRange.start), 'd MMM', { locale: es })} - ${format(new Date(dateRange.end), 'd MMM', { locale: es })}`
                  : 'Personalizado'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={calendarSelection}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
                locale={es}
              />
            </PopoverContent>
          </Popover>

          <div className="h-4 w-px bg-border/60 mx-1" />

          {/* Campaign selection */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  selectedCampaignIds.size > 0
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
                )}
              >
                <Filter className="h-3 w-3" />
                {selectedCampaignIds.size > 0
                  ? `${selectedCampaignIds.size} campaña${selectedCampaignIds.size !== 1 ? 's' : ''}`
                  : 'Todas las campañas'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-w-[90vw] p-0" align="end" side="bottom" sideOffset={4}>
              {/* Header */}
              <div className="p-3 border-b space-y-2.5">
                <div className="text-sm font-bold">Seleccionar campañas</div>

                {/* Search box */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar cliente o campaña..."
                    value={campaignSearch}
                    onChange={e => setCampaignSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                    autoFocus
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button size="sm" variant="default" className="text-xs h-7 flex-1" onClick={handleSelectAll}>
                    Seleccionar todo
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7 flex-1" onClick={handleClearSelection}>
                    Limpiar
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-72">
                <div className="p-3 space-y-3">
                  {Array.from(campaignsByClient.grouped.entries())
                    .map(([clientId, campaigns]) => {
                      const clientName = campaignsByClient.clientNames.get(clientId) ?? ''
                      const searchLower = campaignSearch.toLowerCase()
                      const filteredCampaigns = campaigns.filter(c =>
                        !campaignSearch ||
                        clientName.toLowerCase().includes(searchLower) ||
                        c.name.toLowerCase().includes(searchLower)
                      )
                      if (filteredCampaigns.length === 0) return null
                      return (
                        <div key={clientId} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground uppercase tracking-wide">{clientName}</span>
                            <span className="text-[10px] text-muted-foreground">{filteredCampaigns.length}</span>
                          </div>
                          <div className="space-y-0.5">
                            {filteredCampaigns.map(campaign => (
                              <label key={campaign.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/60 px-2 py-1.5 rounded transition-colors group">
                                <Checkbox
                                  checked={selectedCampaignIds.has(campaign.id)}
                                  onCheckedChange={() => handleToggleCampaign(campaign.id)}
                                  className="h-4 w-4 shrink-0"
                                />
                                <span className="flex-1 text-xs text-foreground truncate group-hover:text-clip">{campaign.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  }
                  {Array.from(campaignsByClient.grouped.entries()).every(([clientId, campaigns]) => {
                    const clientName = campaignsByClient.clientNames.get(clientId) ?? ''
                    const searchLower = campaignSearch.toLowerCase()
                    return campaigns.every(c =>
                      campaignSearch &&
                      !clientName.toLowerCase().includes(searchLower) &&
                      !c.name.toLowerCase().includes(searchLower)
                    )
                  }) && (
                    <div className="text-center text-xs text-muted-foreground py-6">
                      Sin resultados para &quot;{campaignSearch}&quot;
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <div className="h-4 w-px bg-border/60 mx-1" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all',
                filter === opt.value
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-muted-foreground">
              No hay alertas que coincidan con la busqueda.
            </p>
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2">
            {filteredGroups.map(group => (
              <ClientAlertRow
                key={group.clientId}
                group={group}
                expanded={expandedClients.has(group.clientId)}
                onToggle={() => toggleClient(group.clientId)}
              />
            ))}
          </div>
        )}

        {/* Info footer */}
        {totalAlerts > 0 && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              Alertas según la configuración del Controller por cliente. Solo se muestran clientes con alertas activas configuradas por el equipo de paid media.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
