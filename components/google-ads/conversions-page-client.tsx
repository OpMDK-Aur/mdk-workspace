'use client'

import { useState } from 'react'
import type { ConversionResult } from '@/app/api/google-ads/conversions/route'
import { ConversionsTable } from '@/components/google-ads/conversions-table'
import { ConversionsSummary } from '@/components/google-ads/conversions-summary'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Loader2, RefreshCw, TrendingUp } from 'lucide-react'

interface Client {
  id: string
  business_name: string
  google_ads_customer_id?: string | null
}

interface ConversionsPageClientProps {
  clients: Client[]
}

export function ConversionsPageClient({ clients }: ConversionsPageClientProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ConversionResult[] | null>(null)
  const [total, setTotal] = useState(0)

  const googleClients = clients.filter(c => c.google_ads_customer_id)
  const selectedClient = clients.find(c => c.id === selectedClientId)

  async function loadConversions() {
    if (!selectedClient?.google_ads_customer_id) {
      setError('El cliente seleccionado no tiene un Customer ID de Google Ads configurado.')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch('/api/google-ads/conversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selectedClient.google_ads_customer_id }),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        setError(json.error ?? 'Error al cargar conversiones')
        return
      }

      setData(json.conversions ?? [])
      setTotal(json.total ?? 0)
    } catch (err) {
      setError('Error de red. Verificá tu conexion e intentá nuevamente.')
      console.error('[conversions] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-4.5 w-4.5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Conversiones de Google Ads</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-11">
          Resultados de acciones de conversion registradas en los ultimos 30 dias.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {googleClients.length > 0 ? (
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="h-9 w-64 text-sm">
              <SelectValue placeholder="Seleccionar cliente" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    {c.business_name}
                    {!c.google_ads_customer_id && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 border-muted-foreground/30 text-muted-foreground">Sin Google Ads</Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Button
          onClick={loadConversions}
          disabled={loading || !selectedClient?.google_ads_customer_id}
          className="h-9 gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : data !== null ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <TrendingUp className="h-4 w-4" />
          )}
          {loading ? 'Cargando...' : data !== null ? 'Recargar conversiones' : 'Cargar conversiones'}
        </Button>

        {selectedClient?.google_ads_customer_id && (
          <span className="text-xs text-muted-foreground font-mono">
            ID: {selectedClient.google_ads_customer_id}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Error al cargar datos</p>
            <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-muted animate-pulse" />
        </div>
      )}

      {/* Data */}
      {!loading && data !== null && (
        <div className="space-y-5">
          <ConversionsSummary data={data} total={total} />

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Detalle de conversiones</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {data.length} {data.length === 1 ? 'accion' : 'acciones'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ConversionsTable data={data} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty — never loaded */}
      {!loading && data === null && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <TrendingUp className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">Sin datos todavia</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Selecciona un cliente y hace clic en "Cargar conversiones" para ver los datos de Google Ads.
          </p>
        </div>
      )}
    </div>
  )
}
