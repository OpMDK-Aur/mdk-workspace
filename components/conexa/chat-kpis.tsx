import type { ReportKpi } from '@/lib/ai/report-charts'

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const millionsFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const integerFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const decimalFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const deltaFormatter = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })

const NEUTRAL_THRESHOLD = 3

function formatValue(value: number, format: ReportKpi['format']) {
  if (format === 'currency') {
    return Math.abs(value) > 1_000_000 ? `$${millionsFormatter.format(value / 1_000_000)} M` : currencyFormatter.format(value)
  }
  if (format === 'percent') return `${decimalFormatter.format(value)}%`
  return integerFormatter.format(value)
}

function deltaColor(delta: number, invert?: boolean) {
  if (Math.abs(delta) < NEUTRAL_THRESHOLD) return 'text-[#6B6B6B]'
  const isGood = invert ? delta < 0 : delta > 0
  return isGood ? 'text-[#16A34A]' : 'text-[#D92D20]'
}

function isValidKpi(kpi: unknown): kpi is ReportKpi {
  if (!kpi || typeof kpi !== 'object') return false
  const { label, value } = kpi as Partial<ReportKpi>
  return typeof label === 'string' && typeof value === 'number' && Number.isFinite(value)
}

export function ChatKpis({ kpis }: { kpis?: unknown }) {
  const items = Array.isArray(kpis) ? kpis.filter(isValidKpi) : []
  if (items.length < 2) return null

  return (
    <div className="@container mb-4">
      <dl className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
        {items.map((kpi) => {
          const delta = kpi.prev ? ((kpi.value - kpi.prev) / kpi.prev) * 100 : null
          return (
            <div key={kpi.label} className="flex flex-col rounded-xl bg-[#F5F5F3] px-4 py-3.5">
              <dd className="font-display text-[22px] font-extrabold leading-none tracking-[-0.01em] text-[#141414] tabular-nums">
                {formatValue(kpi.value, kpi.format)}
              </dd>
              <dt className="mt-1.5 text-[12px] text-[#6B6B6B]">{kpi.label}</dt>
              {delta !== null ? (
                <p className={`text-[11.5px] font-medium ${deltaColor(delta, kpi.invert)}`}>
                  {`${deltaFormatter.format(delta)}% vs anterior`}
                </p>
              ) : null}
            </div>
          )
        })}
      </dl>
    </div>
  )
}

export function ChatKpisSkeleton() {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-[78px] animate-pulse rounded-xl bg-[#F5F5F3]" />
      ))}
    </div>
  )
}
