'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Client, DashboardFilters, ScorecardRow } from '@/lib/types'

interface ConversionDailyTableProps {
  clients: Client[]
  scorecardRows: ScorecardRow[]
  filters: DashboardFilters
}

interface PivotData {
  dates: string[]
  pivot: Record<string, Record<string, number>>
  conversionNames: string[]
  conversionTypes: Record<string, 'PRIMARY' | 'SECONDARY'>
  total: number
}

type ViewMode = 'daily' | 'monthly'

// Group daily data by month
function groupByMonth(data: PivotData): PivotData {
  const monthlyPivot: Record<string, Record<string, number>> = {}
  const months = new Set<string>()
  
  for (const name of data.conversionNames) {
    monthlyPivot[name] = {}
    for (const date of data.dates) {
      const [year, month] = date.split('-')
      const monthKey = `${year}-${month}`
      months.add(monthKey)
      monthlyPivot[name][monthKey] = (monthlyPivot[name][monthKey] ?? 0) + (data.pivot[name]?.[date] ?? 0)
    }
  }
  
  const sortedMonths = Array.from(months).sort()
  
  return {
    dates: sortedMonths,
    pivot: monthlyPivot,
    conversionNames: data.conversionNames,
    conversionTypes: data.conversionTypes,
    total: data.total,
  }
}

function formatDate(iso: string, viewMode: ViewMode = 'daily'): string {
  if (viewMode === 'monthly') {
    const [year, month] = iso.split('-')
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    return `${monthNames[parseInt(month, 10) - 1]} ${year.slice(2)}`
  }
  const [, month, day] = iso.split('-')
  return `${day}/${month}`
}

function exportCSV(data: PivotData) {
  const header = ['Nombre de conversion', ...data.dates.map(formatDate), 'Total']
  const csvRows = data.conversionNames.map(name => {
    const rowTotal = data.dates.reduce((s, d) => s + (data.pivot[name]?.[d] ?? 0), 0)
    return [name, ...data.dates.map(d => String(Math.round(data.pivot[name]?.[d] ?? 0))), String(Math.round(rowTotal))]
  })
  const csv = [header, ...csvRows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `conversiones-diario-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ConversionDailyTable({
  clients,
  scorecardRows,
  filters,
}: ConversionDailyTableProps) {
  const [data, setData] = useState<PivotData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountName, setAccountName] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  
  // Get display data based on view mode
  const displayData = data ? (viewMode === 'monthly' ? groupByMonth(data) : data) : null

  // Derive Google Ads account ID from global filters
  const googleAccountId = (() => {
    // If a specific ad account is selected in global filters
    if (filters.adAccountId) {
      // Check if it's a Google Ads account
      for (const client of clients) {
        const googleIds = client.google_ads_customer_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        if (googleIds.includes(filters.adAccountId)) {
          return filters.adAccountId
        }
      }
      return null // Selected account is not Google Ads
    }
    
    // If specific clients are selected, use the first client's first Google account
    const targetClients = filters.clientIds.length > 0
      ? clients.filter(c => filters.clientIds.includes(c.id))
      : clients
    
    // Only proceed if Google platform is selected or all platforms
    if (filters.platform === 'meta') return null
    
    for (const client of targetClients) {
      const googleIds = client.google_ads_customer_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
      if (googleIds.length > 0) {
        return googleIds[0]
      }
    }
    return null
  })()

  // Get active client name for display
  const activeClientName = (() => {
    if (!googleAccountId) return null
    for (const client of clients) {
      const googleIds = client.google_ads_customer_id?.split(',').map(s => s.trim()).filter(Boolean) ?? []
      if (googleIds.includes(googleAccountId)) {
        return client.business_name
      }
    }
    return null
  })()

  // Load account name from API
  useEffect(() => {
    if (!googleAccountId) {
      setAccountName(null)
      return
    }
    
    // Set a temporary name immediately while loading
    setAccountName(`Cuenta: ${googleAccountId}`)
    
    fetch('/api/ads/google/accounts')
      .then(r => r.ok ? r.json() : { accounts: [] })
      .then(json => {
        const accounts = json.accounts ?? []
        const normalizeId = (id: string) => id.replace(/[-\s]/g, '').replace(/^0+/, '')
        const normalizedSearchId = normalizeId(googleAccountId)
        const account = accounts.find((a: { id: string; name: string }) => normalizeId(a.id) === normalizedSearchId)
        if (account?.name) {
          setAccountName(account.name)
        }
      })
      .catch(() => {})
  }, [googleAccountId])

  const fetchData = useCallback(async () => {
    if (!googleAccountId) {
      setError('No hay cuenta de Google Ads disponible con los filtros actuales')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/google-ads/conversion-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: googleAccountId,
          dateRange: filters.dateRange.preset ?? 'last_30d',
          startDate: filters.dateRange.start,
          endDate: filters.dateRange.end,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Error al obtener datos')
        return
      }
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [googleAccountId, filters])

  // Auto-reload when filters change
  useEffect(() => {
    if (data && googleAccountId) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAccountId, filters.dateRange.start, filters.dateRange.end, filters.dateRange.preset])

  // Reset data when account changes
  useEffect(() => {
    setData(null)
    setError(null)
  }, [googleAccountId])

  const totalConversions = data
    ? data.conversionNames.reduce((sum, name) =>
        sum + data.dates.reduce((s, d) => s + (data.pivot[name]?.[d] ?? 0), 0), 0)
    : 0

  // Don't render if no Google Ads available
  if (!googleAccountId && filters.platform === 'meta') {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3">
        <div>
          <CardTitle className="text-base font-semibold">Detalle conversiones</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Nombre de conversion por {viewMode === 'daily' ? 'dia' : 'mes'} — Google Ads</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('daily')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'daily' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Diario
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Mensual
            </button>
          </div>

          {/* Display current context from global filters */}
          {activeClientName && (
            <Badge variant="secondary" className="h-7 px-2 text-xs font-normal">
              {activeClientName}
            </Badge>
          )}
          {accountName && (
            <Badge variant="outline" className="h-7 px-2 text-xs font-normal">
              {accountName}
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={fetchData}
            disabled={loading || !googleAccountId}
          >
            {loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            {data ? 'Actualizar' : 'Cargar datos'}
          </Button>

          {data && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => exportCSV(data)}>
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {error && (
          <div className="mx-6 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!googleAccountId && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Selecciona un cliente o cuenta de Google Ads en los filtros superiores para ver conversiones.
            </p>
          </div>
        )}

        {googleAccountId && !data && !loading && !error && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Presiona &quot;Cargar datos&quot; para ver las conversiones diarias.
            </p>
          </div>
        )}

        {loading && (
          <div className="px-6 py-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando conversiones...</span>
          </div>
        )}

        {displayData && !loading && (
          displayData.conversionNames.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">Sin conversiones en el periodo seleccionado.</p>
            </div>
          ) : (
            <>
              <div className="px-6 pb-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{displayData.conversionNames.length} accion{displayData.conversionNames.length !== 1 ? 'es' : ''}</span>
                <span>·</span>
                <span>{displayData.dates.length} {viewMode === 'daily' ? 'dia' : 'mes'}{displayData.dates.length !== 1 ? (viewMode === 'daily' ? 's' : 'es') : ''}</span>
                <span>·</span>
                <span className="font-medium text-foreground">
                  {Math.round(totalConversions).toLocaleString('es-AR')} conversiones totales
                </span>
              </div>
              <ScrollArea className="w-full">
                <div className="min-w-max">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="sticky left-0 z-10 bg-card px-6 py-3 text-left font-medium text-muted-foreground whitespace-nowrap min-w-[220px]">
                          Nombre de conversion
                        </th>
                        {displayData.dates.map(date => (
                          <th key={date} className="px-3 py-3 text-right font-medium text-muted-foreground whitespace-nowrap min-w-[52px]">
                            {formatDate(date, viewMode)}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap min-w-[72px]">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.conversionNames.map((name, i) => {
                        const rowTotal = displayData.dates.reduce((s, d) => s + (displayData.pivot[name]?.[d] ?? 0), 0)
                        const convType = displayData.conversionTypes?.[name] ?? 'PRIMARY'
                        const isPrimary = convType === 'PRIMARY'
                        return (
                          <tr
                            key={name}
                            className={cn(
                              'border-b border-border/50 hover:bg-muted/30 transition-colors',
                              i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                            )}
                          >
                            <td className="sticky left-0 z-10 bg-card px-6 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{name}</span>
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "h-5 px-1.5 text-[10px] font-medium",
                                    isPrimary 
                                      ? "border-green-500/40 bg-green-500/10 text-green-600" 
                                      : "border-muted-foreground/30 bg-muted/50 text-muted-foreground"
                                  )}
                                >
                                  {isPrimary ? 'Principal' : 'Secundaria'}
                                </Badge>
                              </div>
                            </td>
                            {displayData.dates.map(date => {
                              const val = displayData.pivot[name]?.[date] ?? 0
                              return (
                                <td
                                  key={date}
                                  className={cn(
                                    'px-3 py-2.5 text-right tabular-nums',
                                    val > 0 ? 'text-foreground' : 'text-muted-foreground/40'
                                  )}
                                >
                                  {val > 0 ? Math.round(val) : '-'}
                                </td>
                              )
                            })}
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
                              {Math.round(rowTotal).toLocaleString('es-AR')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td className="sticky left-0 z-10 bg-muted/20 px-6 py-2.5 font-semibold text-foreground">
                          Total
                        </td>
                        {displayData.dates.map(date => {
                          const colTotal = displayData.conversionNames.reduce((s, n) => s + (displayData.pivot[n]?.[date] ?? 0), 0)
                          return (
                            <td key={date} className={cn('px-3 py-2.5 text-right tabular-nums font-semibold', colTotal > 0 ? 'text-foreground' : 'text-muted-foreground/40')}>
                              {colTotal > 0 ? Math.round(colTotal) : '-'}
                            </td>
                          )
                        })}
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-primary">
                          {Math.round(totalConversions).toLocaleString('es-AR')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </>
          )
        )}
      </CardContent>
    </Card>
  )
}
