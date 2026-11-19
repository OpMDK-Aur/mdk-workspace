'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, DatabaseZap } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  PERIOD_OPTIONS,
  computeMonthlySeries,
  computePeriodMetrics,
  computePlanBreakdown,
  computeSnapshot,
  previousRange,
  resolvePeriod,
  selectKpiClients,
  type AureliaClient,
  type AureliaDataset,
  type KpiKey,
  type PeriodKey,
} from '@/lib/aurelia/metrics'
import { secondsByClient, todayInArgentina } from '@/lib/aurelia/time-shared'
import { AureliaKpiSheet } from './aurelia-kpi-sheet'
import { AureliaClientSheet } from './aurelia-client-sheet'
import { AureliaTimeSummary } from './aurelia-time-summary'
import { AureliaTimerPill } from './aurelia-timer-pill'
import { useAureliaTime } from './use-aurelia-time'
import type { ClientsTableTime } from './aurelia-clients-table'
import { AureliaHeading } from './aurelia-heading'
import { AureliaKpiGrid } from './aurelia-kpi-grid'
import { AureliaGrowthChart } from './aurelia-growth-chart'
import { AureliaPlanBreakdown } from './aurelia-plan-breakdown'
import { AureliaClientsTable } from './aurelia-clients-table'

export function AureliaDashboard({ dataset }: { dataset: AureliaDataset }) {
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null)
  const [selectedClient, setSelectedClient] = useState<AureliaClient | null>(null)
  const time = useAureliaTime()

  const computed = useMemo(() => {
    if (!dataset.available) return null
    const range = resolvePeriod(period)
    return {
      range,
      current: computePeriodMetrics(dataset.clients, range),
      previous: computePeriodMetrics(dataset.clients, previousRange(range)),
      snapshot: computeSnapshot(dataset.clients),
      series: computeMonthlySeries(dataset.clients),
      plans: computePlanBreakdown(dataset.clients),
    }
  }, [dataset, period])

  const timeData = time.data
  const periodSeconds = useMemo(() => {
    if (!computed || timeData?.available !== true) return new Map<string, number>()
    const toDate = todayInArgentina(new Date(computed.range.end.getTime() - 1))
    return secondsByClient(timeData.entries, todayInArgentina(computed.range.start), toDate)
  }, [computed, timeData])

  if (!dataset.available || !computed) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <AureliaHeading subtitle="Clientes y suscripciones del CRM de Aurelia" />
        <Alert variant="destructive">
          <DatabaseZap className="size-4" aria-hidden="true" />
          <AlertTitle>No se pudo cargar el CRM</AlertTitle>
          <AlertDescription>{dataset.available ? 'Sin datos.' : dataset.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? ''
  const updatedAt = new Date(dataset.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const running = timeData?.available ? timeData.running : null
  const clientById = new Map(dataset.clients.map((client) => [client.id, client]))
  const openClient = (client: AureliaClient) => { setSelectedKpi(null); setSelectedClient(client) }
  const tableTime: ClientsTableTime | undefined = timeData?.available
    ? {
        secondsByClient: periodSeconds,
        runningClientId: running?.clientId ?? null,
        pending: time.pending,
        onToggleTimer: (client) => (running?.clientId === client.id ? time.stop() : time.start(client.id, client.name)),
      }
    : undefined

  return (
    <div className="flex flex-col gap-6 p-6">
      <AureliaHeading
        subtitle={`${dataset.clients.length.toLocaleString('es-AR')} clientes del CRM · actualizado ${updatedAt}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
          {running && (
            <AureliaTimerPill
              running={running}
              pending={time.pending}
              onStop={() => time.stop()}
              onOpen={() => { const client = clientById.get(running.clientId); if (client) openClient(client) }}
            />
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período</span>
            <Select value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
              <SelectTrigger className="h-9 w-48" aria-label="Período">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          </div>
        }
      />

      {(dataset.truncated || !dataset.priceAvailable) && (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Datos parciales</AlertTitle>
          <AlertDescription>
            {!dataset.priceAvailable && 'La tabla plans no tiene una columna de precio reconocible, así que el MRR se muestra en 0. '}
            {dataset.truncated && 'Se alcanzó el tope de 20.000 filas por tabla; algunos clientes pueden no figurar.'}
          </AlertDescription>
        </Alert>
      )}

      <AureliaKpiGrid current={computed.current} previous={computed.previous} snapshot={computed.snapshot} currency={dataset.currency} periodLabel={periodLabel} onSelect={setSelectedKpi} />

      <AureliaKpiSheet
        kpi={selectedKpi}
        clients={selectedKpi ? selectKpiClients(selectedKpi, dataset.clients, computed.range) : []}
        currency={dataset.currency}
        periodLabel={periodLabel}
        onClose={() => setSelectedKpi(null)}
        onOpenClient={openClient}
      />

      <AureliaClientSheet client={selectedClient} currency={dataset.currency} time={time} onClose={() => setSelectedClient(null)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <AureliaGrowthChart series={computed.series} currency={dataset.currency} className="lg:col-span-2" />
        <div className="flex flex-col gap-4">
          <AureliaPlanBreakdown rows={computed.plans} totalMrr={computed.snapshot.mrr} currency={dataset.currency} />
          <AureliaTimeSummary data={timeData} secondsByClient={periodSeconds} clients={dataset.clients} periodLabel={periodLabel} onOpenClient={openClient} />
        </div>
      </div>

      <AureliaClientsTable clients={dataset.clients} currency={dataset.currency} time={tableTime} onOpenClient={openClient} />
    </div>
  )
}
