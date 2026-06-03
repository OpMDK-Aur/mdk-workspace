'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Client, DashboardFilters, ScorecardRow } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import type { DateRange as DayPickerDateRange } from 'react-day-picker'
import { Loader2, Download, ChevronDown, Search, CalendarDays } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BreakdownRow {
  period: string
  impressions: number
  clicks: number
  spend: number
  leads: number
  ctr: number
  cpl: number
  crmContacts?: number
}

interface BreakdownResponse {
  platform: string
  granularity: 'daily' | 'monthly'
  rows: BreakdownRow[]
}

interface ScorecardTimelineProps {
  clients: Client[]
  filters: DashboardFilters
  scorecardRows: ScorecardRow[]
}

// ---------------------------------------------------------------------------
// Metric config
// ---------------------------------------------------------------------------
type MetricStatus = 'available' | 'coming_soon'
interface MetricConfig {
  key: keyof BreakdownRow | 'ventas' | 'calidad'
  label: string
  sublabel: string
  format: 'currency' | 'number' | 'percent' | 'integer'
  status: MetricStatus
}

const METRICS: MetricConfig[] = [
  { key: 'leads',       label: 'Conversiones',          sublabel: 'Leads / Resultados / Conversaciones', format: 'integer',  status: 'available' },
  { key: 'crmContacts', label: 'Contactos CRM',          sublabel: 'Contactos nuevos en el CRM',          format: 'integer',  status: 'coming_soon' },
  { key: 'cpl',         label: 'CPL',                    sublabel: 'Costo por lead',                      format: 'currency', status: 'available' },
  { key: 'ctr',         label: 'CTR',                    sublabel: 'Click through rate',                  format: 'percent',  status: 'available' },
  { key: 'spend',       label: 'Presupuesto invertido',  sublabel: 'Inversion del periodo',               format: 'currency', status: 'available' },
  { key: 'ventas',      label: 'Ventas',                 sublabel: 'Ventas cerradas',                     format: 'currency', status: 'coming_soon' },
  { key: 'calidad',     label: 'Calidad',                sublabel: 'Score de calidad de leads',           format: 'percent',  status: 'coming_soon' },
]

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function fmt(value: number | null | undefined, metricFormat: MetricConfig['format']): string {
  if (value === null || value === undefined) return '-'
  const n = Number(value)
  if (isNaN(n) || n === 0) return '-'
  switch (metricFormat) {
    case 'currency':
      return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    case 'number':
      return n.toLocaleString('es-AR')
    case 'integer':
      return Math.round(n).toLocaleString('es-AR')
    case 'percent':
      return `${n.toFixed(2)}%`
  }
}

function formatPeriodLabel(period: string, granularity: 'daily' | 'monthly'): string {
  try {
    if (granularity === 'monthly') return format(parseISO(`${period}-01`), 'MMM yyyy', { locale: es })
    return format(parseISO(period), 'd MMM', { locale: es })
  } catch { return period }
}

function mergeRows(rowSets: BreakdownRow[][], crmByDay: Record<string, number> = {}): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>()
  for (const rows of rowSets) {
    for (const row of rows) {
      const ex = map.get(row.period)
      if (!ex) {
        map.set(row.period, { ...row, crmContacts: crmByDay[row.period] ?? 0 })
      } else {
        const impressions = ex.impressions + row.impressions
        const clicks      = ex.clicks + row.clicks
        const spend       = ex.spend + row.spend
        const leads       = ex.leads + row.leads
        map.set(row.period, {
          period: row.period,
          impressions,
          clicks,
          spend,
          leads,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpl: leads > 0 ? spend / leads : 0,
          crmContacts: crmByDay[row.period] ?? ex.crmContacts ?? 0,
        })
      }
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
}

function computeTotals(rows: BreakdownRow[]): BreakdownRow {
  const totalImpressions  = rows.reduce((a, r) => a + r.impressions, 0)
  const totalClicks       = rows.reduce((a, r) => a + r.clicks, 0)
  const totalSpend        = rows.reduce((a, r) => a + r.spend, 0)
  const totalLeads        = rows.reduce((a, r) => a + r.leads, 0)
  const totalCrmContacts  = rows.reduce((a, r) => a + (r.crmContacts ?? 0), 0)
  return {
    period:      'Total',
    impressions: totalImpressions,
    clicks:      totalClicks,
    spend:       totalSpend,
    leads:       totalLeads,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
    crmContacts: totalCrmContacts,
  }
}

function exportCSV(periods: string[], rows: BreakdownRow[], granularity: 'daily' | 'monthly', label: string) {
  const periodLabels = periods.map(p => formatPeriodLabel(p, granularity))
  const headers = ['Metrica', ...periodLabels, 'Total']
  const totals = computeTotals(rows)
  const csvRows = METRICS.filter(m => m.status === 'available').map(m => {
    const key = m.key as keyof BreakdownRow
    return [m.label, ...rows.map(r => fmt(r[key] as number, m.format)), fmt(totals[key] as number, m.format)]
  })
  const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scorecard-timeline-${label}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ScorecardTimeline({
  clients,
  filters,
  scorecardRows,
}: ScorecardTimelineProps) {
  const [granularity, setGranularity] = useState<'daily' | 'monthly'>('daily')
  const [visibleMetricKeys, setVisibleMetricKeys] = useState<Set<string>>(
    new Set(METRICS.filter(m => m.status === 'available').map(m => m.key as string))
  )
  const [data, setData] = useState<BreakdownRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountName, setAccountName] = useState<string | null>(null)

  // Local client/campaign selectors
  const [localClientId, setLocalClientId] = useState<string | null>(null)
  const [localCampaignId, setLocalCampaignId] = useState<string | null>(null)
  const [localPlatform, setLocalPlatform] = useState<'meta' | 'google'>('meta')
  const [clientSearch, setClientSearch] = useState('')
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false)
  const [campaignPopoverOpen, setCampaignPopoverOpen] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')

  // ---------------------------------------------------------------------------
  // Local date range (independent from global filters)
  // ---------------------------------------------------------------------------
  type DatePreset = 'today' | 'yesterday' | 'last_7' | 'last_14' | 'last_30' | 'custom'

  function buildRange(preset: DatePreset, customFrom?: string, customTo?: string): { start: string; end: string } {
    const today = startOfDay(new Date())
    const f = (d: Date) => format(d, 'yyyy-MM-dd')
    switch (preset) {
      case 'today':      return { start: f(today),           end: f(today) }
      case 'yesterday':  return { start: f(subDays(today,1)), end: f(subDays(today,1)) }
      case 'last_7':     return { start: f(subDays(today,6)), end: f(today) }
      case 'last_14':    return { start: f(subDays(today,13)),end: f(today) }
      case 'last_30':    return { start: f(subDays(today,29)),end: f(today) }
      case 'custom':     return { start: customFrom ?? f(subDays(today,29)), end: customTo ?? f(today) }
    }
  }

  const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'last_30',   label: 'Últimos 30' },
    { key: 'last_14',   label: 'Últimos 14' },
    { key: 'last_7',    label: 'Últimos 7' },
    { key: 'yesterday', label: 'Ayer' },
    { key: 'today',     label: 'Hoy' },
  ]

  const [activePreset, setActivePreset] = useState<DatePreset>('last_14')
  const [localDateRange, setLocalDateRange] = useState(() => buildRange('last_14'))
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarSel, setCalendarSel] = useState<DayPickerDateRange | undefined>()

  // Unique campaigns from scorecardRows for the selected client
  const availableCampaigns = useMemo(() => {
    if (!localClientId) return []
    return scorecardRows
      .filter(r => r.clientId === localClientId && !!r.campaignId && r.platform === localPlatform)
      .reduce<Array<{ id: string; name: string }>>((acc, r) => {
        if (!acc.find(c => c.id === r.campaignId)) {
          acc.push({ id: r.campaignId!, name: r.campaignName })
        }
        return acc
      }, [])
  }, [scorecardRows, localClientId, localPlatform])

  // Resolve active client + account from local selection or global filters
  const { activeClient, platform, accountId } = useMemo(() => {
    // Prefer local selection
    if (localClientId) {
      const client = clients.find(c => c.id === localClientId)
      if (client) {
        const metaIds = client.meta_ads_account_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        const googleIds = client.google_ads_customer_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        if (localPlatform === 'meta' && metaIds.length > 0) {
          return { activeClient: client, platform: 'meta' as const, accountId: metaIds[0] }
        }
        if (localPlatform === 'google' && googleIds.length > 0) {
          return { activeClient: client, platform: 'google' as const, accountId: googleIds[0] }
        }
        // Auto-detect platform
        if (metaIds.length > 0) return { activeClient: client, platform: 'meta' as const, accountId: metaIds[0] }
        if (googleIds.length > 0) return { activeClient: client, platform: 'google' as const, accountId: googleIds[0] }
      }
    }

    // Fallback: derive from global filters
    const targetClients = filters.clientIds.length > 0
      ? clients.filter(c => filters.clientIds.includes(c.id))
      : clients

    if (filters.adAccountId) {
      for (const client of targetClients) {
        const metaIds = client.meta_ads_account_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        const googleIds = client.google_ads_customer_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        if (metaIds.includes(filters.adAccountId)) return { activeClient: client, platform: 'meta' as const, accountId: filters.adAccountId }
        if (googleIds.includes(filters.adAccountId)) return { activeClient: client, platform: 'google' as const, accountId: filters.adAccountId }
      }
    }
    for (const client of targetClients) {
      if (filters.platform !== 'google' && client.meta_ads_account_id) {
        const ids = client.meta_ads_account_id.split(',').map(s => s.trim()).filter(Boolean)
        if (ids.length > 0) return { activeClient: client, platform: 'meta' as const, accountId: ids[0] }
      }
      if (filters.platform !== 'meta' && client.google_ads_customer_id) {
        const ids = client.google_ads_customer_id.split(',').map(s => s.trim()).filter(Boolean)
        if (ids.length > 0) return { activeClient: client, platform: 'google' as const, accountId: ids[0] }
      }
    }
    return { activeClient: null, platform: 'meta' as const, accountId: null }
  }, [clients, localClientId, localPlatform, filters.clientIds, filters.adAccountId, filters.platform])

  // Load account name
  useEffect(() => {
    if (!accountId) {
      setAccountName(null)
      return
    }
    
    const endpoint = platform === 'google' ? '/api/ads/google/accounts' : '/api/ads/meta/accounts'
    fetch(endpoint)
      .then(r => r.ok ? r.json() : { accounts: [] })
      .then(json => {
        const accounts = json.accounts ?? []
        const normalizeId = (id: string) => id.replace(/[-\s]/g, '').replace(/^0+/, '')
        const normalizedSearchId = normalizeId(accountId)
        const account = accounts.find((a: { id: string; name: string }) => normalizeId(a.id) === normalizedSearchId)
        setAccountName(account?.name ?? null)
      })
      .catch(() => setAccountName(null))
  }, [accountId, platform])

  // Fetch data when filters change
  useEffect(() => {
    if (!activeClient || !accountId) {
      setData([])
      return
    }

    const start = localDateRange.start || ''
    const end   = localDateRange.end   || ''
    if (!start || !end) return

    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ 
      platform, 
      start_date: start, 
      end_date: end, 
      granularity 
    })
    if (platform === 'meta') params.set('account_id', accountId)
    else params.set('customer_id', accountId)
    if (localCampaignId) params.set('campaign_id', localCampaignId)

    // Fetch CRM contacts in parallel if client has CRM configured
    const crmFetch: Promise<Record<string, number>> = (activeClient.crm_type && (activeClient.ghl_location_id || activeClient.ghl_token))
      ? (() => {
          const p = new URLSearchParams({ client_id: activeClient.id, date_range: 'custom', start_date: start, end_date: end })
          return fetch(`/api/crm/contacts?${p}`)
            .then(r => r.json())
            .then((d: { byDay?: Record<string, number> }) => d.byDay ?? {})
            .catch(() => ({}))
        })()
      : Promise.resolve({})

    Promise.all([
      fetch(`/api/ads/breakdown?${params}`)
        .then(r => r.json())
        .then((d: BreakdownResponse & { error?: string }) => {
          if (d.error) throw new Error(d.error)
          return d.rows ?? []
        }),
      crmFetch
    ])
      .then(([rows, crmByDay]) => setData(mergeRows([rows], crmByDay)))
      .catch(e => { setError(e.message); setData([]) })
      .finally(() => setLoading(false))

  }, [activeClient?.id, accountId, platform, granularity, localCampaignId, localDateRange.start, localDateRange.end])

  const toggleMetric = (key: string) => {
    setVisibleMetricKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const periods = data.map(r => r.period)
  const totals  = data.length > 0 ? computeTotals(data) : null
  const exportLabel = activeClient?.business_name ?? 'cliente'

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-4">
        <div>
          <CardTitle className="text-base font-semibold">Scorecard temporal</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{activeClient?.business_name ?? 'Selecciona un cliente'}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Client selector */}
          <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs max-w-[180px]">
                <span className="truncate">
                  {localClientId
                    ? clients.find(c => c.id === localClientId)?.business_name ?? 'Cliente'
                    : 'Seleccionar cliente'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                    autoFocus
                  />
                </div>
              </div>
              <ScrollArea className="h-64">
                <div className="p-1.5 space-y-0.5">
                  {clients
                    .filter(c => !clientSearch || c.business_name.toLowerCase().includes(clientSearch.toLowerCase()))
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setLocalClientId(c.id)
                          setLocalCampaignId(null)
                          // Auto-detect platform
                          const hasMeta = !!(c.meta_ads_account_id?.trim())
                          setLocalPlatform(hasMeta ? 'meta' : 'google')
                          setClientSearch('')
                          setClientPopoverOpen(false)
                        }}
                        className={cn(
                          'w-full text-left text-xs px-2.5 py-2 rounded hover:bg-muted transition-colors',
                          localClientId === c.id && 'bg-primary/10 text-primary font-medium'
                        )}
                      >
                        {c.business_name}
                      </button>
                    ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Campaign selector — only shows when client is selected and has campaigns */}
          {localClientId && availableCampaigns.length > 0 && (
            <Popover open={campaignPopoverOpen} onOpenChange={setCampaignPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs max-w-[200px]">
                  <span className="truncate">
                    {localCampaignId
                      ? availableCampaigns.find(c => c.id === localCampaignId)?.name ?? 'Campaña'
                      : 'Todas las campañas'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-0">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Buscar campaña..."
                      value={campaignSearch}
                      onChange={e => setCampaignSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                      autoFocus
                    />
                  </div>
                </div>
                <ScrollArea className="h-64">
                  <div className="p-1.5 space-y-0.5">
                    <button
                      onClick={() => { setLocalCampaignId(null); setCampaignPopoverOpen(false) }}
                      className={cn(
                        'w-full text-left text-xs px-2.5 py-2 rounded hover:bg-muted transition-colors italic text-muted-foreground',
                        !localCampaignId && 'bg-primary/10 text-primary font-medium not-italic'
                      )}
                    >
                      Todas las campañas
                    </button>
                    {availableCampaigns
                      .filter(c => !campaignSearch || c.name.toLowerCase().includes(campaignSearch.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setLocalCampaignId(c.id); setCampaignSearch(''); setCampaignPopoverOpen(false) }}
                          className={cn(
                            'w-full text-left text-xs px-2.5 py-2 rounded hover:bg-muted transition-colors',
                            localCampaignId === c.id && 'bg-primary/10 text-primary font-medium'
                          )}
                        >
                          {c.name}
                        </button>
                      ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}

          {/* Platform toggle — only when client has both platforms */}
          {localClientId && (() => {
            const c = clients.find(cl => cl.id === localClientId)
            const hasMeta = !!(c?.meta_ads_account_id?.trim())
            const hasGoogle = !!(c?.google_ads_customer_id?.trim())
            return hasMeta && hasGoogle
          })() && (
            <div className="flex rounded-md border border-input">
              <Button
                variant="ghost" size="sm"
                className={cn('h-8 rounded-r-none text-xs px-3', localPlatform === 'meta' && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground')}
                onClick={() => { setLocalPlatform('meta'); setLocalCampaignId(null) }}
              >
                Meta
              </Button>
              <Button
                variant="ghost" size="sm"
                className={cn('h-8 rounded-l-none text-xs px-3 border-l', localPlatform === 'google' && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground')}
                onClick={() => { setLocalPlatform('google'); setLocalCampaignId(null) }}
              >
                Google
              </Button>
            </div>
          )}

          {/* Row selector (metric visibility) — removed per request */}

          {/* Platform badge */}
          <Badge variant="outline" className={cn(
            'text-[10px] h-6 px-2 shrink-0',
            platform === 'meta' ? 'border-blue-400/30 text-blue-400' : 'border-green-400/30 text-green-400'
          )}>
            {platform === 'meta' ? 'Meta' : 'Google'}
          </Badge>

          {/* Date presets */}
          <div className="flex items-center gap-1">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => {
                  setActivePreset(p.key)
                  setLocalDateRange(buildRange(p.key))
                }}
                className={cn(
                  'h-8 px-3 text-xs rounded-md border transition-all font-medium',
                  activePreset === p.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}

            {/* Custom date picker */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'h-8 px-3 text-xs rounded-md border transition-all font-medium inline-flex items-center gap-1.5',
                    activePreset === 'custom'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {activePreset === 'custom'
                    ? `${format(parseISO(localDateRange.start), 'd MMM', { locale: es })} – ${format(parseISO(localDateRange.end), 'd MMM', { locale: es })}`
                    : 'Personalizado'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={calendarSel}
                  onSelect={sel => {
                    setCalendarSel(sel)
                    if (sel?.from && sel?.to) {
                      const from = format(sel.from, 'yyyy-MM-dd')
                      const to   = format(sel.to,   'yyyy-MM-dd')
                      setActivePreset('custom')
                      setLocalDateRange(buildRange('custom', from, to))
                      setCalendarOpen(false)
                    }
                  }}
                  numberOfMonths={2}
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Granularity toggle */}
          <div className="flex rounded-md border border-input">
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 rounded-r-none text-xs px-3', granularity === 'daily' && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground')}
              onClick={() => setGranularity('daily')}
            >
              Diario
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 rounded-l-none text-xs px-3 border-l', granularity === 'monthly' && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground')}
              onClick={() => setGranularity('monthly')}
            >
              Mensual
            </Button>
          </div>

          {/* Export */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => exportCSV(periods, data, granularity, exportLabel)}
            disabled={data.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {error && (
          <div className="mx-6 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && (
          <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando datos...
          </div>
        )}

        {!loading && (!activeClient || !accountId) && !error && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Selecciona un cliente para ver el scorecard
          </div>
        )}

        {!loading && activeClient && accountId && data.length === 0 && !error && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sin datos en el periodo seleccionado
          </div>
        )}

        {!loading && activeClient && accountId && data.length > 0 && (
          <ScrollArea className="w-full pb-4">
            <div className="min-w-max">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-y border-border">
                    <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[180px]">
                      METRICA
                    </th>
                    {periods.map(p => (
                      <th key={p} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[70px]">
                        {formatPeriodLabel(p, granularity)}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right text-xs font-semibold text-foreground whitespace-nowrap min-w-[80px] bg-muted/30">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.filter(m => visibleMetricKeys.has(m.key as string)).map((metric, idx) => {
                    const key = metric.key as keyof BreakdownRow
                    const isComingSoon = metric.status === 'coming_soon'
                    return (
                      <tr key={metric.key as string} className={cn('border-b border-border/50', idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                        <td className="px-6 py-2.5 sticky left-0 bg-card z-10">
                          <div>
                            <p className={cn('font-medium text-foreground', isComingSoon && 'text-muted-foreground')}>{metric.label}</p>
                            <p className="text-[10px] text-muted-foreground">{metric.sublabel}</p>
                          </div>
                        </td>
                        {data.map(row => (
                          <td key={row.period} className={cn('px-3 py-2.5 text-right tabular-nums', isComingSoon ? 'text-muted-foreground/40' : 'text-foreground')}>
                            {isComingSoon ? '-' : fmt(row[key] as number, metric.format)}
                          </td>
                        ))}
                        <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold bg-muted/30', isComingSoon ? 'text-muted-foreground/40' : 'text-foreground')}>
                          {isComingSoon ? '-' : totals ? fmt(totals[key] as number, metric.format) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" className="h-2.5" />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
