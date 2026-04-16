'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import type { ScorecardRow, ScorecardColumn, Client, DashboardFilters } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Download, X, Search, Columns3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScorecardTableProps {
  rows: ScorecardRow[]
  clients: Client[]
  filters: DashboardFilters
  loading?: boolean
  view: 'clients' | 'campaigns'
  onViewChange: (view: 'clients' | 'campaigns') => void
  selectedScorecardClientId: string | null
  onSelectScorecardClient: (id: string | null) => void
  selectedScorecardCampaignIds: string[]
  onSelectScorecardCampaigns: (ids: string[]) => void
}

// ---------------------------------------------------------------------------
// Metric columns (existing KPIs)
// ---------------------------------------------------------------------------
const DEFAULT_COLUMNS: ScorecardColumn[] = [
  { key: 'budget',      label: 'Presupuesto',        visible: true,  format: 'currency' },
  { key: 'leads',       label: 'Leads / Resultados', visible: true,  format: 'number' },
  { key: 'cpl',         label: 'CPL',                visible: true,  format: 'currency' },
  { key: 'ctr',         label: 'CTR',                visible: true,  format: 'percent' },
  { key: 'impressions', label: 'Impresiones',        visible: true,  format: 'number' },
  { key: 'clicks',      label: 'Clicks',             visible: true,  format: 'number' },
  { key: 'spend',       label: 'Inversion',          visible: false, format: 'currency' },
]

// ---------------------------------------------------------------------------
// Segment columns (Google Ads segments)
// ---------------------------------------------------------------------------
interface SegmentColumn {
  key: string
  label: string
  visible: boolean
}

const ALL_SEGMENTS: SegmentColumn[] = [
  { key: 'segments.ad_group',                                label: 'Grupo de anuncio',              visible: false },
  { key: 'segments.asset_group',                             label: 'Grupo de activos',              visible: false },
  { key: 'segments.campaign',                                label: 'Campana',                       visible: false },
  { key: 'segments.conversion_action',                       label: 'Accion de conversion',          visible: false },
  { key: 'segments.conversion_action_category',              label: 'Categoria de conversion',       visible: false },
  { key: 'segments.conversion_action_name',                  label: 'Nombre de conversion',          visible: false },
  { key: 'segments.conversion_attribution_event_type',       label: 'Tipo de atribucion',            visible: false },
  { key: 'segments.conversion_value_rule_primary_dimension', label: 'Dimension valor de conversion', visible: false },
  { key: 'segments.device',                                  label: 'Dispositivo',                   visible: false },
  { key: 'segments.geo_target_city',                         label: 'Ciudad',                        visible: false },
  { key: 'segments.geo_target_country',                      label: 'Pais',                          visible: false },
  { key: 'segments.geo_target_county',                       label: 'Condado',                       visible: false },
  { key: 'segments.geo_target_district',                     label: 'Distrito',                      visible: false },
  { key: 'segments.geo_target_province',                     label: 'Provincia',                     visible: false },
  { key: 'segments.geo_target_region',                       label: 'Region',                        visible: false },
  { key: 'segments.geo_target_state',                        label: 'Estado',                        visible: false },
  { key: 'segments.keyword.ad_group_criterion',              label: 'Keyword',                       visible: false },
  { key: 'segments.landing_page_source',                     label: 'Fuente de landing page',        visible: false },
]

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function formatValue(value: unknown, format: string): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value) || '0')
  switch (format) {
    case 'currency':
      if (!value || num === 0) return '-'
      if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`
      if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`
      return `$${num.toFixed(2)}`
    case 'number':
      if (!value || num === 0) return '-'
      return num >= 1000 ? `${(num / 1000).toFixed(1)}K` : num.toLocaleString('es-AR')
    case 'percent':
      if (!value || num === 0) return '-'
      return `${num.toFixed(2)}%`
    case 'days':
      if (!value || num === 0) return '-'
      return `${Math.round(num)} dias`
    default:
      return String(value || '-')
  }
}

function getPlatformBadge(platform: 'meta' | 'google') {
  return platform === 'meta'
    ? <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-400/30 text-blue-400">Meta</Badge>
    : <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-400/30 text-green-400">Google</Badge>
}

function exportToCSV(rows: ScorecardRow[], columns: ScorecardColumn[], segments: SegmentColumn[]) {
  const visibleCols = columns.filter(c => c.visible)
  const visibleSegs = segments.filter(s => s.visible)
  const headers = ['Cliente', 'Campana', 'Plataforma', ...visibleCols.map(c => c.label), ...visibleSegs.map(s => s.label)]
  const csvRows = rows.map(row => [
    row.clientName,
    row.campaignName || '-',
    row.platform,
    ...visibleCols.map(c => formatValue(row[c.key as keyof ScorecardRow], c.format)),
    ...visibleSegs.map(s => String((row as Record<string, unknown>)[s.key] ?? '-')),
  ])
  const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scorecard-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ScorecardTable({
  rows,
  clients,
  filters,
  loading,
  view,
  onViewChange,
  selectedScorecardClientId,
  onSelectScorecardClient,
  selectedScorecardCampaignIds,
  onSelectScorecardCampaigns,
}: ScorecardTableProps) {
  const [columns] = useState<ScorecardColumn[]>(DEFAULT_COLUMNS)
  const [segments] = useState<SegmentColumn[]>(ALL_SEGMENTS)
  const [campaignPopoverOpen, setCampaignPopoverOpen] = useState(false)
  const [campaignSearch, setCampaignSearch] = useState('')
  const [accountNamesMap, setAccountNamesMap] = useState<Map<string, string>>(new Map())

  const visibleColumns = columns.filter(c => c.visible)
  const visibleSegments = segments.filter(s => s.visible)

  // Fetch account names for display
  useEffect(() => {
    const fetchAccountNames = async () => {
      const map = new Map<string, string>()
      
      // Fetch Google accounts
      try {
        const googleRes = await fetch('/api/ads/google/accounts')
        if (googleRes.ok) {
          const googleData = await googleRes.json()
          for (const acc of googleData.accounts ?? []) {
            map.set(acc.id, acc.name)
          }
        }
      } catch {}
      
      // Fetch Meta accounts
      try {
        const metaRes = await fetch('/api/ads/meta/accounts')
        if (metaRes.ok) {
          const metaData = await metaRes.json()
          for (const acc of metaData.accounts ?? []) {
            map.set(acc.id, acc.name)
          }
        }
      } catch {}
      
      setAccountNamesMap(map)
    }
    fetchAccountNames()
  }, [])

  // Get account name from filters or accountNamesMap
  const getAccountName = useCallback((row: ScorecardRow): string => {
    // If we have adAccountId in filters, use that
    if (filters.adAccountId) {
      const name = accountNamesMap.get(filters.adAccountId)
      if (name) return name
    }
    // If row has accountId, try to get name from map
    if (row.accountId) {
      const name = accountNamesMap.get(row.accountId)
      if (name) return name
    }
    // Fallback: use row.accountName if available
    if (row.accountName) return row.accountName
    return '-'
  }, [filters.adAccountId, accountNamesMap])

  const campaignOptions = useMemo(() => rows
    .filter(r => !selectedScorecardClientId || r.clientId === selectedScorecardClientId)
    .filter((r, i, arr) => arr.findIndex(x => x.campaignId === r.campaignId) === i)
    .filter(r => r.campaignId), [rows, selectedScorecardClientId])

  const filteredCampaignOptions = useMemo(() =>
    campaignOptions.filter(r =>
      !campaignSearch || (r.campaignName ?? '').toLowerCase().includes(campaignSearch.toLowerCase())
    ), [campaignOptions, campaignSearch])

  // Check if a specific account is selected in global filters
  const hasAccountSelected = !!filters.adAccountId

  const filteredRows = useMemo(() => {
    let result = rows.filter(row => {
      if (selectedScorecardClientId && row.clientId !== selectedScorecardClientId) return false
      if (selectedScorecardCampaignIds.length > 0 && !selectedScorecardCampaignIds.includes(row.campaignId ?? '')) return false
      return true
    })
    // If no account is selected, limit to first 5 results
    if (!hasAccountSelected) {
      result = result.slice(0, 5)
    }
    return result
  }, [rows, selectedScorecardClientId, selectedScorecardCampaignIds, hasAccountSelected])

  // Calculate totals for numeric columns
  const totals = useMemo(() => {
    const sums: Record<string, number> = {}
    for (const col of visibleColumns) {
      if (col.format === 'currency' || col.format === 'number') {
        sums[col.key] = filteredRows.reduce((sum, row) => {
          const val = row[col.key as keyof ScorecardRow]
          return sum + (typeof val === 'number' ? val : 0)
        }, 0)
      } else if (col.format === 'percent') {
        // Average for percentages
        const values = filteredRows.map(row => row[col.key as keyof ScorecardRow]).filter((v): v is number => typeof v === 'number')
        sums[col.key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      }
    }
    return sums
  }, [filteredRows, visibleColumns])

  const toggleCampaign = useCallback((id: string) => {
    onSelectScorecardCampaigns(
      selectedScorecardCampaignIds.includes(id)
        ? selectedScorecardCampaignIds.filter(x => x !== id)
        : [...selectedScorecardCampaignIds, id]
    )
  }, [selectedScorecardCampaignIds, onSelectScorecardCampaigns])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3">
        <div>
          <CardTitle className="text-base font-semibold">Scorecard</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Metricas detalladas por cliente y campana</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => onViewChange('clients')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                view === 'clients' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Clientes
            </button>
            <button
              onClick={() => onViewChange('campaigns')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                view === 'campaigns' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Campanas
            </button>
          </div>

          {/* Campaign multi-select */}
          {view === 'campaigns' && campaignOptions.length > 0 && (
            <Popover open={campaignPopoverOpen} onOpenChange={open => { setCampaignPopoverOpen(open); if (!open) setCampaignSearch('') }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 min-w-[160px] justify-between">
                  <span className="truncate">
                    {selectedScorecardCampaignIds.length === 0
                      ? 'Todas las campanas'
                      : selectedScorecardCampaignIds.length === 1
                        ? (campaignOptions.find(c => c.campaignId === selectedScorecardCampaignIds[0])?.campaignName ?? 'Campana').slice(0, 22) + '...'
                        : `${selectedScorecardCampaignIds.length} campanas`}
                  </span>
                  {selectedScorecardCampaignIds.length > 0
                    ? <X className="h-3 w-3 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={e => { e.stopPropagation(); onSelectScorecardCampaigns([]) }} />
                    : <Columns3 className="h-3 w-3 shrink-0 text-muted-foreground" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="p-2 border-b border-border">
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      autoFocus
                      placeholder="Buscar campana..."
                      value={campaignSearch}
                      onChange={e => setCampaignSearch(e.target.value)}
                      className="bg-transparent text-xs outline-none flex-1 placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                {/* Select all / clear */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => onSelectScorecardCampaigns(campaignOptions.map(c => c.campaignId!))}
                  >
                    Seleccionar todas
                  </button>
                  {selectedScorecardCampaignIds.length > 0 && (
                    <button
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => onSelectScorecardCampaigns([])}
                    >
                      Limpiar ({selectedScorecardCampaignIds.length})
                    </button>
                  )}
                </div>
                <ScrollArea className="max-h-64">
                  <div className="p-1">
                    {filteredCampaignOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">Sin resultados</p>
                    ) : filteredCampaignOptions.map(c => {
                      const checked = selectedScorecardCampaignIds.includes(c.campaignId!)
                      return (
                        <label
                          key={c.campaignId}
                          className={cn(
                            'flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                            checked ? 'bg-primary/10' : 'hover:bg-muted'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCampaign(c.campaignId!)}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground truncate">{c.campaignName || 'Sin nombre'}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {getPlatformBadge(c.platform)}
                              <span className="text-[10px] text-muted-foreground">{c.clientName}</span>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => exportToCSV(filteredRows, columns, segments)}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="px-6 py-4 space-y-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-10 bg-muted rounded" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">Sin datos para los filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Cliente</TableHead>
                  <TableHead className="min-w-[160px]">Cuenta</TableHead>
                  {view === 'campaigns' && <TableHead className="min-w-[200px]">Campana</TableHead>}
                  <TableHead>Plataforma</TableHead>
                  {visibleColumns.map(col => (
                    <TableHead key={col.key} className="text-right whitespace-nowrap">
                      {col.label}
                    </TableHead>
                  ))}
                  {visibleSegments.map(seg => (
                    <TableHead key={seg.key} className="text-right whitespace-nowrap">
                      {seg.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, i) => (
                  <TableRow key={`${row.clientId}-${row.campaignId || i}`}>
                    <TableCell className="font-medium">{row.clientName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{getAccountName(row)}</TableCell>
                    {view === 'campaigns' && (
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {row.campaignName || '-'}
                      </TableCell>
                    )}
                    <TableCell>{getPlatformBadge(row.platform)}</TableCell>
                    {visibleColumns.map(col => (
                      <TableCell key={col.key} className="text-right tabular-nums">
                        {formatValue(row[col.key as keyof ScorecardRow], col.format)}
                      </TableCell>
                    ))}
                    {visibleSegments.map(seg => (
                      <TableCell key={seg.key} className="text-right tabular-nums text-muted-foreground">
                        {String((row as Record<string, unknown>)[seg.key] ?? '-')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {/* Totals row */}
                {filteredRows.length > 0 && (
                  <TableRow className="bg-muted/30 border-t-2 border-border font-semibold">
                    <TableCell className="font-bold text-foreground">Total</TableCell>
                    <TableCell></TableCell>
                    {view === 'campaigns' && <TableCell></TableCell>}
                    <TableCell></TableCell>
                    {visibleColumns.map(col => (
                      <TableCell key={col.key} className="text-right tabular-nums font-semibold text-foreground">
                        {formatValue(totals[col.key], col.format)}
                      </TableCell>
                    ))}
                    {visibleSegments.map(seg => (
                      <TableCell key={seg.key} className="text-right tabular-nums text-muted-foreground">
                        -
                      </TableCell>
                    ))}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
