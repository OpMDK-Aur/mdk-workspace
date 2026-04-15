'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Client, DashboardFilters, ScorecardRow } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Download, Rows3 } from 'lucide-react'
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

  // Derive active client and account from global filters
  const { activeClient, platform, accountId } = useMemo(() => {
    const targetClients = filters.clientIds.length > 0
      ? clients.filter(c => filters.clientIds.includes(c.id))
      : clients

    // If specific ad account is selected
    if (filters.adAccountId) {
      for (const client of targetClients) {
        const metaIds = client.meta_ads_account_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        const googleIds = client.google_ads_customer_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        
        if (metaIds.includes(filters.adAccountId)) {
          return { activeClient: client, platform: 'meta' as const, accountId: filters.adAccountId }
        }
        if (googleIds.includes(filters.adAccountId)) {
          return { activeClient: client, platform: 'google' as const, accountId: filters.adAccountId }
        }
      }
    }

    // Use platform filter to determine which account to use
    for (const client of targetClients) {
      if (filters.platform !== 'google' && client.meta_ads_account_id) {
        const ids = client.meta_ads_account_id.split(',').map(s => s.trim()).filter(Boolean)
        if (ids.length > 0) {
          return { activeClient: client, platform: 'meta' as const, accountId: ids[0] }
        }
      }
      if (filters.platform !== 'meta' && client.google_ads_customer_id) {
        const ids = client.google_ads_customer_id.split(',').map(s => s.trim()).filter(Boolean)
        if (ids.length > 0) {
          return { activeClient: client, platform: 'google' as const, accountId: ids[0] }
        }
      }
    }

    return { activeClient: null, platform: 'meta' as const, accountId: null }
  }, [clients, filters.clientIds, filters.adAccountId, filters.platform])

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

    const start = filters.dateRange.start || ''
    const end   = filters.dateRange.end   || ''
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

  }, [activeClient?.id, accountId, platform, granularity, filters.dateRange.start, filters.dateRange.end])

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

  if (!activeClient || !accountId) return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-2">
        <p className="text-sm font-medium text-muted-foreground">Sin datos disponibles</p>
        <p className="text-xs text-muted-foreground/60">Selecciona un cliente o cuenta en los filtros superiores</p>
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
          {/* Display context from global filters */}
          {accountName && (
            <Badge variant="outline" className="h-7 px-2 text-xs font-normal">
              {accountName}
            </Badge>
          )}

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

        {!loading && data.length === 0 && !error && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sin datos en el periodo seleccionado
          </div>
        )}

        {!loading && data.length > 0 && (
          <ScrollArea className="w-full">
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
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
