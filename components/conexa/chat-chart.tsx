import type { BarsChartSpec, ChartSpec, ColumnsChartSpec, FunnelChartSpec } from '@/lib/ai/chart-spec'

const CUR_COLOR = 'var(--primary)'
const PREV_COLOR = 'var(--border)'

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('es-AR')
}

function formatValue(value: number, prefix?: string) {
  if (prefix === '$') return `$ ${Math.round(value).toLocaleString('es-AR')}`
  return `${prefix ?? ''}${formatNumber(value)}`
}

function formatPercent(value: number) {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function variation(cur: number, prev: number) {
  if (prev === 0) return null
  return (cur - prev) / prev
}

function variationColor(change: number) {
  if (Math.abs(change) < 0.03) return 'var(--muted-foreground)'
  return change > 0 ? '#16A34A' : '#D92D20'
}

function Variation({ cur, prev, suffix }: { cur: number; prev: number; suffix?: string }) {
  const change = variation(cur, prev)
  if (change === null) {
    return <span className="text-[11px] text-muted-foreground">—</span>
  }
  const sign = change > 0 ? '+' : ''
  return (
    <span className="text-[11px]">
      <span style={{ color: variationColor(change) }}>{`${sign}${formatPercent(change * 100)}%`}</span>
      {suffix ? <span className="text-muted-foreground">{` ${suffix}`}</span> : null}
    </span>
  )
}

function widthPercent(value: number, max: number, min = 0) {
  if (max <= 0) return `${min}%`
  return `${Math.max(min, Math.min(100, (value / max) * 100))}%`
}

function Legend({ curLabel = 'Esta semana', prevLabel = 'Semana anterior' }: { curLabel?: string; prevLabel?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: CUR_COLOR }} />
        {curLabel}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: PREV_COLOR }} />
        {prevLabel}
      </span>
    </div>
  )
}

function BarsChart({ spec }: { spec: BarsChartSpec }) {
  const max = Math.max(...spec.rows.flatMap((row) => [row.cur, row.prev]))
  return (
    <div className="flex flex-col gap-3">
      {spec.rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[110px_minmax(0,1fr)_90px] items-center gap-2.5">
          <span className="truncate text-[12px] text-muted-foreground" title={row.label}>{row.label}</span>
          <div className="flex flex-col gap-[3px]">
            <div className="h-2 rounded" style={{ width: widthPercent(row.cur, max), backgroundColor: CUR_COLOR }} />
            <div className="h-2 rounded" style={{ width: widthPercent(row.prev, max), backgroundColor: PREV_COLOR }} />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[12.5px] font-semibold tabular-nums text-foreground">
              {formatValue(row.cur, spec.prefix)}
            </span>
            <Variation cur={row.cur} prev={row.prev} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ColumnsChart({ spec }: { spec: ColumnsChartSpec }) {
  const totalCur = spec.cur.reduce((sum, value) => sum + value, 0)
  const totalPrev = spec.prev.reduce((sum, value) => sum + value, 0)
  const max = Math.max(...spec.cur, ...spec.prev)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[18px] font-bold tabular-nums text-foreground">{formatNumber(totalCur)}</span>
        <Variation cur={totalCur} prev={totalPrev} suffix={`vs ${(spec.prevLabel ?? 'semana anterior').toLowerCase()}`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex h-24 items-end justify-between gap-1 border-b border-border">
          {spec.labels.map((label, index) => (
            <div key={`${label}-${index}`} className="flex h-full flex-1 items-end justify-center gap-0.5">
              <div className="w-full max-w-3 rounded-t-[3px]" style={{ height: widthPercent(spec.prev[index], max), backgroundColor: PREV_COLOR }} />
              <div className="w-full max-w-3 rounded-t-[3px]" style={{ height: widthPercent(spec.cur[index], max), backgroundColor: CUR_COLOR }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between gap-1">
          {spec.labels.map((label, index) => (
            <span key={`${label}-${index}`} className="flex-1 text-center text-[10.5px] text-muted-foreground" title={label}>
              {label.length > 3 ? label.charAt(0).toUpperCase() : label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function conversion(value: number, base: number) {
  return base > 0 ? (value / base) * 100 : null
}

function FunnelChart({ spec }: { spec: FunnelChartSpec }) {
  const first = spec.stages[0]
  return (
    <div className="flex flex-col gap-1.5">
      {spec.stages.map((stage, index) => {
        const previousStage = index > 0 ? spec.stages[index - 1] : null
        const conv = previousStage ? conversion(stage.cur, previousStage.cur) : null
        const convPrev = previousStage ? conversion(stage.prev, previousStage.prev) : null
        return (
          <div key={stage.label} className="flex flex-col gap-1.5">
            {previousStage && conv !== null ? (
              <p className="m-0 pl-[94px] text-[11px]" style={{ color: stage.highlight ? '#D92D20' : 'var(--muted-foreground)' }}>
                {`↓ ${formatPercent(conv)}%`}
                {convPrev !== null ? <span className="text-muted-foreground">{` · antes ${formatPercent(convPrev)}%`}</span> : null}
              </p>
            ) : null}
            <div className="grid grid-cols-[110px_minmax(0,1fr)_90px] items-center gap-2.5">
              <span className="truncate text-[12px] text-muted-foreground" title={stage.label}>{stage.label}</span>
              <div
                className="h-[18px] rounded-[5px]"
                style={{ width: widthPercent(stage.cur, first.cur, 4), backgroundColor: stage.highlight ? CUR_COLOR : 'var(--muted)' }}
              />
              <div className="flex flex-col items-end">
                <span className="text-[12.5px] font-semibold tabular-nums text-foreground">{formatNumber(stage.cur)}</span>
                <span className="text-[11px] text-muted-foreground">{`antes ${formatNumber(stage.prev)}`}</span>
              </div>
            </div>
          </div>
        )
      })}
      {spec.note ? (
        <p className="m-0 mt-1.5 border-t border-border pt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{spec.note}</p>
      ) : null}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div role="status" aria-label="Cargando gráfico" className="mt-2.5 flex w-full flex-col gap-3 rounded-xl border border-border bg-muted p-3.5">
      <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted" />
    </div>
  )
}

export function ChatChart({ spec }: { spec: ChartSpec }) {
  return (
    <figure className="not-prose m-0 mt-2.5 w-full rounded-xl border border-border bg-muted p-3.5">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="text-[12.5px] font-semibold text-foreground">{spec.title}</span>
        <Legend curLabel={spec.curLabel} prevLabel={spec.prevLabel} />
      </figcaption>
      {spec.type === 'bars' ? <BarsChart spec={spec} /> : null}
      {spec.type === 'columns' ? <ColumnsChart spec={spec} /> : null}
      {spec.type === 'funnel' ? <FunnelChart spec={spec} /> : null}
    </figure>
  )
}
