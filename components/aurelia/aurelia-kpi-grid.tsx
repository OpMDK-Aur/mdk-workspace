import { ArrowDownRight, ArrowUpRight, ChevronRight, Info, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatMoney, type KpiKey, type PeriodMetrics, type SnapshotMetrics } from '@/lib/aurelia/metrics'

type Trend = { delta: number; goodWhenUp: boolean; format: (value: number) => string }

const KPI_INFO: Record<KpiKey, string> = {
  mrr: 'Ingreso mensual recurrente de hoy: suma lo que pagan por mes las suscripciones activas y las que tienen un pago pendiente.',
  altas: 'Clientes que entraron por primera vez en el período, aunque estén en prueba. Cada cliente cuenta una sola vez, por la fecha de su primera suscripción. No incluye las cuentas internas de Aurelia y MDK.',
  activaciones: 'Clientes que empezaron a pagar su plan actual en el período, aunque se hayan dado de alta antes. Si el plan tuvo prueba, cuenta el día en que terminó; si no, el día en que se creó. No cuentan las pruebas ni los planes gratis. Ejemplo: entra el 10 con 7 días de prueba y paga el 17: es Alta el 10 y Activación el 17. La fecha es estimada porque el CRM no guarda el cambio de estado.',
  bajas: 'Clientes cuya suscripción finalizó en el período.',
  netas: 'Altas menos bajas del período. Si es negativo, se fueron más clientes de los que entraron.',
  activos: 'Clientes con la suscripción activa y al día. Los que tienen un pago pendiente se cuentan aparte.',
  past_due: 'Suscripciones vigentes con un cobro sin acreditar. Siguen sumando al MRR mientras no se den de baja.',
  trial: 'Clientes con una prueba vigente. Todavía no pagan, así que no suman MRR.',
  churn: 'Bajas del período divididas por los clientes activos que había al inicio del período.',
  arpa: 'Ingreso promedio por cuenta: el MRR dividido por las cuentas que pagan. Abajo ves el MRR que entró y el que se perdió en el período.',
}

function KpiCard({ kpi, label, value, hint, trend, emphasis, onSelect }: { kpi: KpiKey; label: string; value: string; hint: string; trend?: Trend; emphasis?: boolean; onSelect: () => void }) {
  const direction = trend ? Math.sign(trend.delta) : 0
  const positive = trend ? (direction > 0) === trend.goodWhenUp : false
  const TrendIcon = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus
  return (
    <div className="relative">
    <button type="button" onClick={onSelect} className="group h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label}: ${value}. Ver clientes`}>
      <Card className={cn('h-full gap-0 py-0 transition-colors group-hover:border-primary/50 group-hover:bg-muted/40', emphasis && 'border-primary/40 bg-primary/5')}>
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="pr-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
          </div>
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
    </button>
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Qué significa ${label}`} className="absolute right-9 top-3.5 flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm leading-relaxed">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-pretty text-muted-foreground">{KPI_INFO[kpi]}</p>
      </PopoverContent>
    </Popover>
    </div>
  )
}

const count = (value: number) => value.toLocaleString('es-AR')
const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)

export function AureliaKpiGrid({ current, previous, snapshot, currency, periodLabel, onSelect }: { current: PeriodMetrics; previous: PeriodMetrics; snapshot: SnapshotMetrics; currency: string; periodLabel: string; onSelect: (key: KpiKey) => void }) {
  const money = (value: number) => formatMoney(value, currency)
  const vsPrevious = 'vs. período anterior'
  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      <KpiCard kpi="mrr" emphasis label="MRR actual" value={money(snapshot.mrr)} hint={`${count(snapshot.pagando)} cuentas pagando`} onSelect={() => onSelect('mrr')} />
      <KpiCard kpi="altas" label={`Altas · ${periodLabel}`} value={count(current.altas)} hint={vsPrevious} trend={{ delta: current.altas - previous.altas, goodWhenUp: true, format: count }} onSelect={() => onSelect('altas')} />
      <KpiCard kpi="activaciones" label={`Activaciones · ${periodLabel}`} value={count(current.activaciones)} hint="empezaron a pagar" trend={{ delta: current.activaciones - previous.activaciones, goodWhenUp: true, format: count }} onSelect={() => onSelect('activaciones')} />
      <KpiCard kpi="bajas" label={`Bajas · ${periodLabel}`} value={count(current.bajas)} hint={vsPrevious} trend={{ delta: current.bajas - previous.bajas, goodWhenUp: false, format: count }} onSelect={() => onSelect('bajas')} />
      <KpiCard kpi="netas" label="Altas netas" value={`${current.netas > 0 ? '+' : ''}${count(current.netas)}`} hint={vsPrevious} trend={{ delta: current.netas - previous.netas, goodWhenUp: true, format: count }} onSelect={() => onSelect('netas')} />
      <KpiCard kpi="activos" label="Clientes activos" value={count(snapshot.activos)} hint="suscripción al día" onSelect={() => onSelect('activos')} />
      <KpiCard kpi="past_due" label="Pago pendiente" value={count(snapshot.pagoPendiente)} hint="siguen sumando MRR" onSelect={() => onSelect('past_due')} />
      <KpiCard kpi="trial" label="En prueba" value={count(snapshot.enPrueba)} hint="trial vigente, aún sin MRR" onSelect={() => onSelect('trial')} />
      <KpiCard kpi="churn" label="Churn del período" value={percent(current.churnRate)} hint={`sobre ${count(current.activosInicio)} activos al inicio`} trend={current.churnRate !== null && previous.churnRate !== null ? { delta: current.churnRate - previous.churnRate, goodWhenUp: false, format: (value) => percent(value) } : undefined} onSelect={() => onSelect('churn')} />
      <KpiCard kpi="arpa" label="ARPA" value={snapshot.arpa === null ? '—' : money(snapshot.arpa)} hint={`MRR nuevo ${money(current.mrrNuevo)} · perdido ${money(current.mrrPerdido)}`} onSelect={() => onSelect('arpa')} />
    </section>
  )
}
