'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Client, DashboardFilters, ScorecardRow } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Download, ChevronDown, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

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
  selectedClientId: string | null
  selectedCampaignId: string | null
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
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
      if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`
      return `$${n.toFixed(2)}`
    case 'number':
      return n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString('es-AR')
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
  selectedClientId,
  selectedCampaignId,
  scorecardRows,
}: ScorecardTimelineProps) {
  const [granularity, setGranularity] = useState<'daily' | 'monthly'>('daily')
  const [visibleMetricKeys, setVisibleMetricKeys] = useState<Set<string>>(
    new Set(METRICS.filter(m => m.status === 'available').map(m => m.key as string))
  )
  // Multi-select campaigns: 'all' means all, otherwise a Set of campaignIds
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set())
  const [data, setData] = useState<BreakdownRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve active client
  const activeClient = useMemo(() => {
    if (selectedClientId) return clients.find(c => c.id === selectedClientId) ?? null
    if (filters.adAccountId) {
      return clients.find(c =>
        c.meta_ads_account_id?.split(',').map(s => s.trim()).includes(filters.adAccountId!) ||
        c.google_ads_customer_id?.split(',').map(s => s.trim()).includes(filters.adAccountId!)
      ) ?? null
    }
    return null
  }, [selectedClientId, clients, filters.adAccountId])

  // Campaigns available for active client
  const availableCampaigns = useMemo(() => {
    if (!activeClient) return []
    return scorecardRows.filter(r => r.clientId === activeClient.id && !!r.campaignId)
  }, [activeClient, scorecardRows])

  // Sync with parent scorecard campaign selection
  useEffect(() => {
    if (selectedCampaignId) setSelectedCampaignIds(new Set([selectedCampaignId]))
    else setSelectedCampaignIds(new Set())
  }, [selectedCampaignId])

  // Reset campaigns when client changes
  useEffect(() => {
    setSelectedCampaignIds(new Set())
  }, [activeClient?.id])

  // Derive platform
  const platform = useMemo<'meta' | 'google'>(() => {
    if (!activeClient) return 'meta'
    const adAccountId = filters.adAccountId
    if (adAccountId) {
      if (activeClient.meta_ads_account_id?.split(',').map(s => s.trim()).includes(adAccountId)) return 'meta'
      if (activeClient.google_ads_customer_id?.split(',').map(s => s.trim()).includes(adAccountId)) return 'google'
    }
    if (filters.platform === 'meta' && activeClient.meta_ads_account_id) return 'meta'
    if (filters.platform === 'google' && activeClient.google_ads_customer_id) return 'google'
    if (activeClient.meta_ads_account_id) return 'meta'
    return 'google'
  }, [activeClient, filters.platform, filters.adAccountId])

  // Fetch — merge results from ALL account IDs of the client for the given platform
  useEffect(() => {
    if (!activeClient) return

    const start = filters.dateRange.start || ''
    const end   = filters.dateRange.end   || ''
    if (!start || !end) return

    const adAccountId = filters.adAccountId

    // Collect IDs to fetch
    let idsToFetch: string[] = []
    if (platform === 'meta') {
      const all = activeClient.meta_ads_account_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
      idsToFetch = adAccountId && all.includes(adAccountId) ? [adAccountId] : all
    } else {
      const all = activeClient.google_ads_customer_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
      idsToFetch = adAccountId && all.includes(adAccountId) ? [adAccountId] : all
    }

    if (idsToFetch.length === 0) return

    // Determine which campaign IDs to filter by
    const campaignIdsToFetch = selectedCampaignIds.size > 0 ? [...selectedCampaignIds] : [null]

    setLoading(true)
    setError(null)

    const fetchOne = (id: string, campaignId: string | null): Promise<BreakdownRow[]> => {
      const params = new URLSearchParams({ platform, start_date: start, end_date: end, granularity })
      if (platform === 'meta') params.set('account_id', id)
      else params.set('customer_id', id)
      if (campaignId) params.set('campaign_id', campaignId)

      return fetch(`/api/ads/breakdown?${params}`)
        .then(r => r.json())
        .then((d: BreakdownResponse & { error?: string }) => {
          if (d.error) throw new Error(d.error)
          return d.rows ?? []
        })
    }

    // Fetch all combinations of [ids × campaigns] and merge
    const fetches: Promise<BreakdownRow[]>[] = []
    for (const id of idsToFetch) {
      for (const cid of campaignIdsToFetch) {
        fetches.push(fetchOne(id, cid))
      }
    }

    // Fetch CRM contacts by day in parallel (only if client has CRM configured)
    const crmFetch: Promise<Record<string, number>> = (activeClient.crm_type && (activeClient.ghl_location_id || activeClient.ghl_token))
      ? (() => {
          const p = new URLSearchParams({ client_id: activeClient.id, date_range: 'custom', start_date: start, end_date: end })
          return fetch(`/api/crm/contacts?${p}`)
            .then(r => r.json())
            .then((d: { byDay?: Record<string, number> }) => d.byDay ?? {})
            .catch(() => ({}))
        })()
      : Promise.resolve({})

    Promise.all([Promise.all(fetches), crmFetch])
      .then(([rowSets, crmByDay]) => setData(mergeRows(rowSets, crmByDay)))
      .catch(e => { setError(e.message); setData([]) })
      .finally(() => setLoading(false))

  }, [activeClient?.id, platform, granularity, filters.dateRange.start, filters.dateRange.end, filters.adAccountId, selectedCampaignIds])

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

  // Campaign selector label
  const campaignSelectorLabel = useMemo(() => {
    if (selectedCampaignIds.size === 0) return 'Todas las campanas'
    if (selectedCampaignIds.size === 1) {
      const id = [...selectedCampaignIds][0]
      return availableCampaigns.find(c => c.campaignId === id)?.campaignName ?? 'Campana'
    }
    return `${selectedCampaignIds.size} campanas`
  }, [selectedCampaignIds, availableCampaigns])

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!activeClient) return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-2">
        <p className="text-sm font-medium text-muted-foreground">Selecciona un cliente en el Scorecard</p>
        <p className="text-xs text-muted-foreground/60">Hace click en una fila del scorecard para ver su evolucion temporal</p>
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3 pb-4">
        <div>
          <CardTitle className="text-base font-semibold">Scorecard temporal</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{activeClient.business_name}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Campaign multi-selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs max-w-[220px]">
                <span className="truncate">{campaignSelectorLabel}</span>
                {selectedCampaignIds.size > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">{selectedCampaignIds.size}</Badge>
                )}
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 max-h-72 overflow-y-auto">
              <DropdownMenuItem
                onClick={() => setSelectedCampaignIds(new Set())}
                className={cn(!selectedCampaignIds.size && 'bg-muted')}
              >
                <span className="font-medium">Todas las campanas</span>
              </DropdownMenuItem>
              {availableCampaigns.length > 0 && <DropdownMenuSeparator />}
              {availableCampaigns.map(c => (
                <DropdownMenuCheckboxItem
                  key={c.campaignId}
                  checked={selectedCampaignIds.has(c.campaignId!)}
                  onCheckedChange={() => toggleCampaign(c.campaignId!)}
                >
                  <span className="text-xs truncate max-w-[220px]">{c.campaignName}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Row selector (metric visibility) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Rows3 className="h-3.5 w-3.5" />
                Seleccionar filas
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {visibleMetricKeys.size}
                </Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs font-semibold">Filas visibles</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Mostrar u ocultar metricas</p>
              </div>
              <ScrollArea className="h-64">
                <div className="p-2">
                  {METRICS.map(metric => (
                    <label
                      key={metric.key as string}
                      className={cn(
                        'flex items-start gap-2.5 px-2 py-1.5 rounded-md cursor-pointer',
                        metric.status === 'coming_soon' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'
                      )}
                    >
                      <Checkbox
                        checked={visibleMetricKeys.has(metric.key as string)}
                        onCheckedChange={() => metric.status !== 'coming_soon' && toggleMetric(metric.key as string)}
                        disabled={metric.status === 'coming_soon'}
                        className="h-3.5 w-3.5 mt-0.5"
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">{metric.label}</p>
                        <p className="text-[10px] text-muted-foreground">{metric.sublabel}</p>
                      </div>
                      {metric.status === 'coming_soon' && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto shrink-0 border-muted-foreground/30 text-muted-foreground">
                          Prox.
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Platform badge */}
          <Badge variant="outline" className={cn(
            'text-[10px] h-6 px-2 shrink-0',
            platform === 'meta' ? 'border-blue-400/30 text-blue-400' : 'border-green-400/30 text-green-400'
          )}>
            {platform === 'meta' ? 'Meta' : 'Google'}
          </Badge>

          {/* Granularity toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['daily', 'monthly'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  g === 'daily' && 'border-r border-border',
                  granularity === g ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {g === 'daily' ? 'Diario' : 'Mensual'}
              </button>
            ))}
          </div>

          {data.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => exportCSV(periods, data, granularity, exportLabel)}>
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando datos...</span>
          </div>
        ) : error ? (
          <div className="px-6 py-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">Sin datos para el periodo seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider min-w-[200px]">
                    Metrica
                  </th>
                  {periods.map(p => (
                    <th key={p} className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap min-w-[80px]">
                      {formatPeriodLabel(p, granularity)}
                    </th>
                  ))}
                  <th className="text-right px-4 py-2.5 font-semibold text-foreground text-xs uppercase tracking-wider min-w-[90px] border-l border-border">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {METRICS.filter(m => visibleMetricKeys.has(m.key as string)).map((metric, mi) => {
                  const isComingSoon = metric.status === 'coming_soon'
                  const key = metric.key as keyof BreakdownRow
                  return (
                    <tr key={metric.key} className={cn(
                      'border-b border-border/50 transition-colors',
                      !isComingSoon && 'hover:bg-muted/30',
                      isComingSoon && 'opacity-50',
                      mi === 0 && 'font-medium'
                    )}>
                      <td className="sticky left-0 z-10 bg-background px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className={cn('text-sm font-medium', isComingSoon && 'text-muted-foreground')}>{metric.label}</p>
                            <p className="text-[11px] text-muted-foreground">{metric.sublabel}</p>
                          </div>
                          {isComingSoon && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0 border-muted-foreground/30 text-muted-foreground">
                              Prox.
                            </Badge>
                          )}
                        </div>
                      </td>
                      {isComingSoon ? (
                        periods.map(p => <td key={p} className="text-right px-3 py-3 tabular-nums text-muted-foreground/40">-</td>)
                      ) : (
                        data.map(row => (
                          <td key={row.period} className="text-right px-3 py-3 tabular-nums text-foreground">
                            {fmt(row[key] as number, metric.format)}
                          </td>
                        ))
                      )}
                      <td className="text-right px-4 py-3 tabular-nums font-semibold border-l border-border">
                        {isComingSoon ? <span className="text-muted-foreground/40">-</span>
                          : <span>{totals ? fmt(totals[key] as number, metric.format) : '-'}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
