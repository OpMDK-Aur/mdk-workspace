import { chartFence, type ChartSpec } from './chart-spec'

type ToolResultLike = { toolName?: string; output?: unknown }
type StepLike = { toolResults?: ToolResultLike[] }

type PeriodSnapshot = { start: string; output: Record<string, unknown> }

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MAX_CAMPAIGNS = 5

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function cleanName(value: unknown) {
  const name = typeof value === 'string' && value.trim() ? value.trim() : 'Sin nombre'
  return name.replace(/\|/g, ' - ').replace(/\s+/g, ' ')
}

function startOf(output: Record<string, unknown>) {
  const range = (output.date_range ?? output.dateRange) as { start?: unknown } | undefined
  return typeof range?.start === 'string' ? range.start : null
}

/** Devuelve [actual, anterior] solo si la tool se ejecutó para dos períodos distintos. */
function currentAndPrevious(snapshots: PeriodSnapshot[]) {
  const byStart = new Map<string, PeriodSnapshot>()
  for (const snapshot of snapshots) byStart.set(snapshot.start, snapshot)
  const ordered = [...byStart.values()].sort((a, b) => b.start.localeCompare(a.start))
  return ordered.length >= 2 ? [ordered[0], ordered[1]] as const : null
}

function accountsOf(output: Record<string, unknown>) {
  return Array.isArray(output.accounts) ? output.accounts as Array<Record<string, unknown>> : []
}

function platformSpend(output: Record<string, unknown>) {
  return accountsOf(output).reduce((sum, account) => {
    const totals = account.totals as Record<string, unknown> | undefined
    if (totals && totals.spend !== undefined) return sum + toNumber(totals.spend)
    const campaigns = Array.isArray(account.campaigns) ? account.campaigns as Array<Record<string, unknown>> : []
    return sum + campaigns.reduce((acc, campaign) => acc + toNumber(campaign.spend ?? campaign.cost), 0)
  }, 0)
}

function campaignSpend(output: Record<string, unknown>) {
  const spend = new Map<string, number>()
  for (const account of accountsOf(output)) {
    const campaigns = Array.isArray(account.campaigns) ? account.campaigns as Array<Record<string, unknown>> : []
    for (const campaign of campaigns) {
      const name = cleanName(campaign.name ?? campaign.campaign_name)
      spend.set(name, (spend.get(name) ?? 0) + toNumber(campaign.spend ?? campaign.cost))
    }
  }
  return spend
}

function sessionsByDay(output: Record<string, unknown>) {
  const reports = output.reports as { byDay?: Array<Record<string, unknown>> } | undefined
  return (reports?.byDay ?? [])
    .filter((row) => typeof row.date === 'string' && /^\d{8}$/.test(row.date as string))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((row) => ({ date: String(row.date), sessions: toNumber(row.sessions) }))
}

function weekdayLabel(yyyymmdd: string) {
  const date = new Date(Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8))))
  return WEEKDAY_LABELS[date.getUTCDay()]
}

/**
 * o4-mini no siempre emite los bloques de gráfico. Como respaldo
 * determinístico armamos ChartSpec solo con los resultados reales de las
 * tools ejecutadas en el turno, y solo cuando hay período actual y anterior
 * (nunca inventamos la comparación).
 */
export function buildAutoCharts(steps: StepLike[]) {
  const snapshots: Record<'meta' | 'google' | 'analytics', PeriodSnapshot[]> = { meta: [], google: [], analytics: [] }
  const toolPlatform: Record<string, keyof typeof snapshots> = {
    get_meta_metrics: 'meta',
    get_google_metrics: 'google',
    get_google_analytics_report: 'analytics',
  }

  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      const platform = result.toolName ? toolPlatform[result.toolName] : undefined
      if (!platform || !result.output || typeof result.output !== 'object') continue
      const output = result.output as Record<string, unknown>
      if (output.available === false) continue
      const start = startOf(output)
      if (start) snapshots[platform].push({ start, output })
    }
  }

  const charts: ChartSpec[] = []

  const meta = currentAndPrevious(snapshots.meta)
  const google = currentAndPrevious(snapshots.google)
  const platformRows = [
    meta && { label: 'Meta Ads', cur: round(platformSpend(meta[0].output)), prev: round(platformSpend(meta[1].output)) },
    google && { label: 'Google Ads', cur: round(platformSpend(google[0].output)), prev: round(platformSpend(google[1].output)) },
  ].filter((row): row is { label: string; cur: number; prev: number } => !!row && (row.cur > 0 || row.prev > 0))
  if (platformRows.length > 0) charts.push({ type: 'bars', title: 'Inversión por plataforma', prefix: '$', rows: platformRows })

  for (const [label, pair] of [['Meta Ads', meta], ['Google Ads', google]] as const) {
    if (!pair) continue
    const current = campaignSpend(pair[0].output)
    const previous = campaignSpend(pair[1].output)
    const rows = [...current.entries()]
      .filter(([, spend]) => spend > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CAMPAIGNS)
      .map(([name, spend]) => ({ label: name, cur: round(spend), prev: round(previous.get(name) ?? 0) }))
    if (rows.length >= 2) charts.push({ type: 'bars', title: `Inversión por campaña · ${label}`, prefix: '$', rows })
  }

  const analytics = currentAndPrevious(snapshots.analytics)
  if (analytics) {
    const current = sessionsByDay(analytics[0].output)
    const previous = sessionsByDay(analytics[1].output)
    const length = Math.min(current.length, previous.length)
    if (length >= 2) {
      charts.push({
        type: 'columns',
        title: 'Sesiones por día · Analytics',
        labels: current.slice(0, length).map((day) => weekdayLabel(day.date)),
        cur: current.slice(0, length).map((day) => day.sessions),
        prev: previous.slice(0, length).map((day) => day.sessions),
      })
    }
  }

  return charts.slice(0, 3).map(chartFence)
}
