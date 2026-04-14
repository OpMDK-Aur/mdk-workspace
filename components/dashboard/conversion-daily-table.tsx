'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Download, Loader2, RefreshCw, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Client, ScorecardRow } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ConversionDailyTableProps {
  clients: Client[]
  scorecardRows: ScorecardRow[]
  selectedClientId: string | null      // synced from scorecard client filter
  selectedCampaignId: string | null    // synced from scorecard campaign filter
  filters: { dateRange: { preset?: string; start?: string; end?: string } }
}

interface PivotData {
  dates: string[]
  pivot: Record<string, Record<string, number>>
  conversionNames: string[]
  total: number
}

function formatDate(iso: string): string {
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
  selectedClientId,
  selectedCampaignId,
  filters,
}: ConversionDailyTableProps) {
  const [data, setData] = useState<PivotData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Filter clients that have Google Ads configured
  const googleAdsClients = clients.filter(c => c.google_ads_customer_id)
  
  // Internal client selection - can be changed independently from scorecard
  const [internalClientId, setInternalClientId] = useState<string | null>(
    selectedClientId ?? (googleAdsClients.length > 0 ? googleAdsClients[0].id : null)
  )
  
  // Sync with scorecard selection when it changes
  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId && c.google_ads_customer_id)
      if (client) {
        setInternalClientId(selectedClientId)
      }
    }
  }, [selectedClientId, clients])
  
  // Get the active client from internal selection
  const activeClient = googleAdsClients.find(c => c.id === internalClientId) ?? null

  // Label for selected campaign
  const campaignLabel = selectedCampaignId
    ? (scorecardRows.find(r => r.campaignId === selectedCampaignId)?.campaignName ?? 'Campana seleccionada')
    : 'Todas las campanas'

  const fetchData = useCallback(async (client: Client) => {
    if (!client.google_ads_customer_id) {
      setError('El cliente seleccionado no tiene Google Ads configurado')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/google-ads/conversion-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: client.google_ads_customer_id,
          campaignId: selectedCampaignId ?? undefined,
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
  }, [selectedCampaignId, filters])

  // Auto-reload when filters or selection changes — only if we already had data loaded
  useEffect(() => {
    if (data && activeClient) {
      fetchData(activeClient)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, selectedCampaignId, filters])

  const totalConversions = data
    ? data.conversionNames.reduce((sum, name) =>
        sum + data.dates.reduce((s, d) => s + (data.pivot[name]?.[d] ?? 0), 0), 0)
    : 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3">
        <div>
          <CardTitle className="text-base font-semibold">Detalle conversiones (diario)</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Nombre de conversion por dia — Google Ads</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">

          {/* Client selector */}
          <div className="flex items-center gap-2">
            {googleAdsClients.length > 0 ? (
              <Select 
                value={internalClientId ?? ''} 
                onValueChange={(val) => {
                  setInternalClientId(val)
                  setData(null) // Reset data when client changes
                }}
              >
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Seleccionar cliente" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {googleAdsClients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="h-7 px-2 text-xs font-normal text-muted-foreground">
                Sin clientes con Google Ads
              </Badge>
            )}
            <Badge variant="outline" className="h-7 px-2 text-xs font-normal gap-1">
              <span className="text-muted-foreground">Campana:</span>
              {campaignLabel}
            </Badge>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => activeClient && fetchData(activeClient)}
            disabled={loading || !activeClient}
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

        {!data && !loading && !error && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {activeClient
                ? `Presiona "Cargar datos" para ver las conversiones diarias de ${activeClient.business_name}.`
                : 'Selecciona un cliente con Google Ads desde el filtro de arriba para ver conversiones.'}
            </p>
          </div>
        )}

        {loading && (
          <div className="px-6 py-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando conversiones...</span>
          </div>
        )}

        {data && !loading && (
          data.conversionNames.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">Sin conversiones en el periodo seleccionado.</p>
            </div>
          ) : (
            <>
              <div className="px-6 pb-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{data.conversionNames.length} accion{data.conversionNames.length !== 1 ? 'es' : ''}</span>
                <span>·</span>
                <span>{data.dates.length} dia{data.dates.length !== 1 ? 's' : ''}</span>
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
                        {data.dates.map(date => (
                          <th key={date} className="px-3 py-3 text-right font-medium text-muted-foreground whitespace-nowrap min-w-[52px]">
                            {formatDate(date)}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap min-w-[72px]">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.conversionNames.map((name, i) => {
                        const rowTotal = data.dates.reduce((s, d) => s + (data.pivot[name]?.[d] ?? 0), 0)
                        return (
                          <tr
                            key={name}
                            className={cn(
                              'border-b border-border/50 hover:bg-muted/30 transition-colors',
                              i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                            )}
                          >
                            <td className="sticky left-0 z-10 bg-card px-6 py-2.5 font-medium text-foreground whitespace-nowrap">
                              {name}
                            </td>
                            {data.dates.map(date => {
                              const val = data.pivot[name]?.[date] ?? 0
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
                        {data.dates.map(date => {
                          const colTotal = data.conversionNames.reduce((s, n) => s + (data.pivot[n]?.[date] ?? 0), 0)
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
