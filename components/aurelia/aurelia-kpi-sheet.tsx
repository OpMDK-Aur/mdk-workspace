'use client'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { KPI_DETAIL, formatMoney, type AureliaClient, type KpiKey } from '@/lib/aurelia/metrics'
import { AureliaClientsTable } from './aurelia-clients-table'

export function AureliaKpiSheet({ kpi, clients, currency, periodLabel, onClose }: { kpi: KpiKey | null; clients: AureliaClient[]; currency: string; periodLabel: string; onClose: () => void }) {
  const detail = kpi ? KPI_DETAIL[kpi] : null
  const isPeriodKpi = kpi === 'altas' || kpi === 'bajas' || kpi === 'netas' || kpi === 'churn'
  const totalMrr = clients.reduce((sum, client) => sum + client.mrr, 0)
  return (
    <Sheet open={kpi !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-4xl">
        <SheetHeader className="border-b">
          <SheetTitle>{detail?.title}{isPeriodKpi ? ` · ${periodLabel}` : ''}</SheetTitle>
          <SheetDescription>
            {detail?.description} {clients.length.toLocaleString('es-AR')} {clients.length === 1 ? 'cliente' : 'clientes'}
            {totalMrr > 0 ? ` · ${formatMoney(totalMrr, currency)} de MRR` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {kpi && <AureliaClientsTable key={kpi} bare clients={clients} currency={currency} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
