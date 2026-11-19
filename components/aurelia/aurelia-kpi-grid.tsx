import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatMoney, type PeriodMetrics, type SnapshotMetrics } from '@/lib/aurelia/metrics'

type Trend = { delta: number; goodWhenUp: boolean; format: (value: number) => string }

function KpiCard({ label, value, hint, trend, emphasis }: { label: string; value: string; hint: string; trend?: Trend; emphasis?: boolean }) {
  const direction = trend ? Math.sign(trend.delta) : 0
  const positive = trend ? (direction > 0) === trend.goodWhenUp : false
  const TrendIcon = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus
  return (
    <Card className={cn('gap-0 py-0', emphasis && 'border-primary/40 bg-primary/5')}>
      <CardContent className="flex flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-semibold tabular-nums tracking-tight', emphasis && 'text-primary')}>{value}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend && (
            <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', direction === 0 ? 'text-muted-foreground' : positive ? 'text-chart-2' : 'text-destructive')}>
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {trend.format(Math.abs(trend.delta))}
            </span>
          )}
          <span className="truncate">{hint}</span>
        </div>
      </CardContent>
    </Card>
  )
}

const count = (value: number) => value.toLocaleString('es-AR')
const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)

export function AureliaKpiGrid({ current, previous, snapshot, currency, periodLabel }: { current: PeriodMetrics; previous: PeriodMetrics; snapshot: SnapshotMetrics; currency: string; periodLabel: string }) {
  const money = (value: number) => formatMoney(value, currency)
  const vsPrevious = 'vs. período anterior'
  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard emphasis label="MRR actual" value={money(snapshot.mrr)} hint={`${count(snapshot.pagando)} cuentas pagando`} />
      <KpiCard label={`Altas · ${periodLabel}`} value={count(current.altas)} hint={vsPrevious} trend={{ delta: current.altas - previous.altas, goodWhenUp: true, format: count }} />
      <KpiCard label={`Bajas · ${periodLabel}`} value={count(current.bajas)} hint={vsPrevious} trend={{ delta: current.bajas - previous.bajas, goodWhenUp: false, format: count }} />
      <KpiCard label="Altas netas" value={`${current.netas > 0 ? '+' : ''}${count(current.netas)}`} hint={vsPrevious} trend={{ delta: current.netas - previous.netas, goodWhenUp: true, format: count }} />
      <KpiCard label="Clientes activos" value={count(snapshot.activos)} hint={`${count(snapshot.pagoPendiente)} con pago pendiente`} />
      <KpiCard label="En prueba" value={count(snapshot.enPrueba)} hint="trial vigente, aún sin MRR" />
      <KpiCard label="Churn del período" value={percent(current.churnRate)} hint={`sobre ${count(current.activosInicio)} activos al inicio`} trend={current.churnRate !== null && previous.churnRate !== null ? { delta: current.churnRate - previous.churnRate, goodWhenUp: false, format: (value) => percent(value) } : undefined} />
      <KpiCard label="ARPA" value={snapshot.arpa === null ? '—' : money(snapshot.arpa)} hint={`MRR nuevo ${money(current.mrrNuevo)} · perdido ${money(current.mrrPerdido)}`} />
    </section>
  )
}
