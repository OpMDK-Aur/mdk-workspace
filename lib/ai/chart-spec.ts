type PeriodLabels = { curLabel?: string; prevLabel?: string }

export type BarsChartSpec = PeriodLabels & {
  type: 'bars'
  title: string
  prefix?: string
  rows: { label: string; cur: number; prev: number }[]
}

export type ColumnsChartSpec = PeriodLabels & {
  type: 'columns'
  title: string
  labels: string[]
  cur: number[]
  prev: number[]
}

export type FunnelChartSpec = PeriodLabels & {
  type: 'funnel'
  title: string
  stages: { label: string; cur: number; prev: number; highlight?: boolean }[]
  note?: string
}

export type ChartSpec = BarsChartSpec | ColumnsChartSpec | FunnelChartSpec

export type ChatBlock = { heading?: string; text?: string; chart?: ChartSpec }

export const CHART_FENCE = 'conexa-chart'

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isString = (value: unknown): value is string => typeof value === 'string'

export function parseChartSpec(raw: unknown): ChartSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const spec = raw as Record<string, unknown>
  if (!isString(spec.title)) return null
  const labels = {
    ...(isString(spec.curLabel) ? { curLabel: spec.curLabel } : {}),
    ...(isString(spec.prevLabel) ? { prevLabel: spec.prevLabel } : {}),
  }

  if (spec.type === 'bars' && Array.isArray(spec.rows)) {
    const rows = spec.rows.filter((row): row is BarsChartSpec['rows'][number] =>
      !!row && isString(row.label) && isNumber(row.cur) && isNumber(row.prev))
    if (rows.length === 0) return null
    return { ...labels, type: 'bars', title: spec.title, prefix: isString(spec.prefix) ? spec.prefix : undefined, rows }
  }

  if (spec.type === 'columns' && Array.isArray(spec.labels) && Array.isArray(spec.cur) && Array.isArray(spec.prev)) {
    const length = Math.min(spec.labels.length, spec.cur.length, spec.prev.length)
    if (length === 0) return null
    const columnLabels = spec.labels.slice(0, length).map(String)
    const cur = spec.cur.slice(0, length)
    const prev = spec.prev.slice(0, length)
    if (!cur.every(isNumber) || !prev.every(isNumber)) return null
    return { ...labels, type: 'columns', title: spec.title, labels: columnLabels, cur, prev }
  }

  if (spec.type === 'funnel' && Array.isArray(spec.stages)) {
    const stages = spec.stages.filter((stage): stage is FunnelChartSpec['stages'][number] =>
      !!stage && isString(stage.label) && isNumber(stage.cur) && isNumber(stage.prev))
    if (stages.length < 2) return null
    return { ...labels, type: 'funnel', title: spec.title, stages, note: isString(spec.note) ? spec.note : undefined }
  }

  return null
}

export function chartFence(spec: ChartSpec) {
  return `\`\`\`${CHART_FENCE}\n${JSON.stringify(spec)}\n\`\`\``
}
