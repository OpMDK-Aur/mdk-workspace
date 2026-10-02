import type { ChartSpec } from './chart-spec'

export const REPORT_HEADINGS = ['RESUMEN', 'GOOGLE ADS', 'META ADS', 'ANALYTICS', 'CRM', 'HALLAZGOS', 'RECOMENDACIONES', 'PRÓXIMOS PASOS'] as const
export const CHART_KEYS = ['spend_by_platform', 'leads_by_channel', 'sessions_daily', 'crm_funnel', 'none'] as const

export type ReportHeading = (typeof REPORT_HEADINGS)[number]
export type ChartKey = (typeof CHART_KEYS)[number]
export type ReportSection = { heading: ReportHeading; text: string; chart?: ChartSpec }

export type DateRange = { from: string; to: string }
type Output = Record<string, unknown>
/** Ejecuta una tool de datos existente (con caché por turno) para un rango. */
export type RunTool = (toolKey: string, range: DateRange) => Promise<Output | null>

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const CHANNEL_LABELS: Record<string, string> = {
  PERFORMANCE_MAX: 'Performance Max',
  SEARCH: 'Search',
  DISPLAY: 'Display',
  VIDEO: 'Video',
  DEMAND_GEN: 'Demand Gen',
  SHOPPING: 'Shopping',
}

export const PLATFORM_TOOL: Partial<Record<ReportHeading, string>> = {
  'META ADS': 'get_meta_metrics',
  'GOOGLE ADS': 'get_google_metrics',
  ANALYTICS: 'get_google_analytics_report',
}

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const isAvailable = (output: Output | null): output is Output => !!output && output.available === true

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function rangeLength(range: DateRange) {
  return Math.round((toDate(range.to).getTime() - toDate(range.from).getTime()) / 86_400_000) + 1
}

export function previousRange(range: DateRange): DateRange {
  const days = rangeLength(range)
  const to = toDate(range.from)
  to.setUTCDate(to.getUTCDate() - 1)
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - days + 1)
  return { from: toIso(from), to: toIso(to) }
}

/** Últimos 7 días completos en Buenos Aires (sin incluir hoy). */
export function defaultRange(): DateRange {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const to = toDate(today)
  to.setUTCDate(to.getUTCDate() - 1)
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 6)
  return { from: toIso(from), to: toIso(to) }
}

/** Rango efectivo de un resultado de tool, según el formato de cada integración. */
export function outputRange(output: unknown, input: unknown): DateRange | null {
  const record = (output && typeof output === 'object' ? output : {}) as Output
  const dateRange = (record.date_range ?? record.dateRange) as { start?: unknown; end?: unknown } | undefined
  if (typeof dateRange?.start === 'string' && typeof dateRange?.end === 'string') return { from: dateRange.start, to: dateRange.end }
  const period = record.period as { date_from?: unknown; date_to?: unknown } | undefined
  if (typeof period?.date_from === 'string' && typeof period?.date_to === 'string') return { from: period.date_from, to: period.date_to }
  const args = (input && typeof input === 'object' ? input : {}) as { dateFrom?: unknown; dateTo?: unknown }
  if (typeof args.dateFrom === 'string' && typeof args.dateTo === 'string') return { from: args.dateFrom, to: args.dateTo }
  return null
}

function accounts(output: Output) {
  return Array.isArray(output.accounts) ? (output.accounts as Output[]) : []
}

function campaigns(account: Output) {
  return Array.isArray(account.campaigns) ? (account.campaigns as Output[]) : []
}

function sumTotals(output: Output, field: string) {
  return accounts(output).reduce((sum, account) => {
    const totals = account.totals as Output | undefined
    if (totals && totals[field] !== undefined) return sum + toNumber(totals[field])
    return sum + campaigns(account).reduce((acc, campaign) => acc + toNumber(campaign[field]), 0)
  }, 0)
}

function googleLeadsByChannel(output: Output) {
  const byChannel = new Map<string, number>()
  for (const account of accounts(output)) {
    for (const campaign of campaigns(account)) {
      const type = String(campaign.advertising_channel_type ?? 'UNKNOWN')
      const label = CHANNEL_LABELS[type] ?? 'Otros'
      byChannel.set(label, (byChannel.get(label) ?? 0) + toNumber(campaign.leads))
    }
  }
  return byChannel
}

function sessionsByDay(output: Output) {
  const reports = output.reports as { byDay?: Output[] } | undefined
  return (reports?.byDay ?? [])
    .filter((row) => typeof row.date === 'string' && /^\d{8}$/.test(row.date as string))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((row) => ({ date: String(row.date), sessions: toNumber(row.sessions) }))
}

function dayLabel(yyyymmdd: string, weekly: boolean) {
  const date = new Date(Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8))))
  return weekly ? WEEKDAYS[date.getUTCDay()] : String(date.getUTCDate())
}

function periodLabels(range: DateRange) {
  const days = rangeLength(range)
  if (days === 7) return { curLabel: 'Esta semana', prevLabel: 'Semana anterior' }
  if (days >= 28 && days <= 31) return { curLabel: 'Este mes', prevLabel: 'Mes anterior' }
  return { curLabel: 'Período actual', prevLabel: 'Período anterior' }
}

const hasPrevious = (values: number[]) => values.some((value) => value > 0)

type Row = { label: string; cur: number; prev: number }

async function spendByPlatform(run: RunTool, current: DateRange, previous: DateRange): Promise<ChartSpec | null> {
  const rows: Row[] = []
  for (const [label, key] of [['Google Ads', 'get_google_metrics'], ['Meta Ads', 'get_meta_metrics']] as const) {
    const [cur, prev] = await Promise.all([run(key, current), run(key, previous)])
    if (!isAvailable(cur) || !isAvailable(prev)) continue
    const row = { label, cur: sumTotals(cur, 'spend'), prev: sumTotals(prev, 'spend') }
    if (row.cur > 0 || row.prev > 0) rows.push(row)
  }
  if (rows.length === 0 || !hasPrevious(rows.map((row) => row.prev))) return null
  return { type: 'bars', title: 'Inversión por plataforma', prefix: '$', rows, ...periodLabels(current) }
}

async function leadsByChannel(run: RunTool, current: DateRange, previous: DateRange): Promise<ChartSpec | null> {
  const rows: Row[] = []
  const [googleCur, googlePrev, metaCur, metaPrev] = await Promise.all([
    run('get_google_metrics', current), run('get_google_metrics', previous),
    run('get_meta_metrics', current), run('get_meta_metrics', previous),
  ])
  if (isAvailable(googleCur) && isAvailable(googlePrev)) {
    const cur = googleLeadsByChannel(googleCur)
    const prev = googleLeadsByChannel(googlePrev)
    for (const label of new Set([...cur.keys(), ...prev.keys()])) {
      const row = { label, cur: cur.get(label) ?? 0, prev: prev.get(label) ?? 0 }
      if (row.cur > 0 || row.prev > 0) rows.push(row)
    }
  }
  if (isAvailable(metaCur) && isAvailable(metaPrev)) {
    const row = { label: 'Meta', cur: sumTotals(metaCur, 'results'), prev: sumTotals(metaPrev, 'results') }
    if (row.cur > 0 || row.prev > 0) rows.push(row)
  }
  if (rows.length === 0 || !hasPrevious(rows.map((row) => row.prev))) return null
  rows.sort((a, b) => b.cur - a.cur)
  return { type: 'bars', title: 'Leads por canal', rows: rows.slice(0, 6), ...periodLabels(current) }
}

async function sessionsDaily(run: RunTool, current: DateRange, previous: DateRange): Promise<ChartSpec | null> {
  const [cur, prev] = await Promise.all([run('get_google_analytics_report', current), run('get_google_analytics_report', previous)])
  if (!isAvailable(cur) || !isAvailable(prev)) return null
  const curDays = sessionsByDay(cur)
  const prevDays = sessionsByDay(prev)
  const length = Math.min(curDays.length, prevDays.length)
  if (length < 2) return null
  const prevValues = prevDays.slice(0, length).map((day) => day.sessions)
  if (!hasPrevious(prevValues)) return null
  const weekly = length <= 7
  return {
    type: 'columns',
    title: 'Sesiones por día · Analytics',
    labels: curDays.slice(0, length).map((day) => dayLabel(day.date, weekly)),
    cur: curDays.slice(0, length).map((day) => day.sessions),
    prev: prevValues,
    ...periodLabels(current),
  }
}

function funnelCounts(contacts: Output, opportunities: Output) {
  const contactTotals = contacts.totals as Output | undefined
  const opportunityTotals = opportunities.totals as { opportunities?: unknown; by_status?: Record<string, unknown> } | undefined
  return [
    toNumber(contactTotals?.contacts),
    toNumber(opportunityTotals?.opportunities),
    toNumber(opportunityTotals?.by_status?.won),
  ]
}

async function crmFunnel(run: RunTool, current: DateRange, previous: DateRange): Promise<ChartSpec | null> {
  const [contactsCur, contactsPrev, oppCur, oppPrev] = await Promise.all([
    run('crm_contacts', current), run('crm_contacts', previous),
    run('crm_opportunities', current), run('crm_opportunities', previous),
  ])
  if (!isAvailable(contactsCur) || !isAvailable(contactsPrev) || !isAvailable(oppCur) || !isAvailable(oppPrev)) return null
  const cur = funnelCounts(contactsCur, oppCur)
  const prev = funnelCounts(contactsPrev, oppPrev)
  if (cur[0] === 0 || !hasPrevious(prev)) return null

  let worstStage = 1
  let worstRate = Number.POSITIVE_INFINITY
  for (let index = 1; index < cur.length; index += 1) {
    const rate = cur[index - 1] > 0 ? cur[index] / cur[index - 1] : 0
    if (rate < worstRate) {
      worstRate = rate
      worstStage = index
    }
  }

  const labels = ['Contactos', 'Oportunidades', 'Ventas']
  return {
    type: 'funnel',
    title: 'Funnel del CRM',
    stages: labels.map((label, index) => ({ label, cur: cur[index], prev: prev[index], highlight: index === worstStage })),
    ...periodLabels(current),
  }
}

const BUILDERS: Record<Exclude<ChartKey, 'none'>, (run: RunTool, current: DateRange, previous: DateRange) => Promise<ChartSpec | null>> = {
  spend_by_platform: spendByPlatform,
  leads_by_channel: leadsByChannel,
  sessions_daily: sessionsDaily,
  crm_funnel: crmFunnel,
}

const CHART_MENTION = /\(?\s*(?:renderizad[oa]|ver|se muestra (?:en )?(?:el)?)\s+gr[aá]fico[^)\n]*\)?/gi

async function hasPlatformData(run: RunTool, heading: ReportHeading, current: DateRange) {
  const toolKey = PLATFORM_TOOL[heading]
  if (!toolKey) return true
  const output = await run(toolKey, current)
  if (!isAvailable(output)) return false
  if (toolKey === 'get_google_analytics_report') return sessionsByDay(output).some((day) => day.sessions > 0) || !!output.reports
  return sumTotals(output, 'spend') > 0 || sumTotals(output, 'impressions') > 0
}

export async function buildReportSections(
  sections: Array<{ heading: ReportHeading; text: string; chartKey: ChartKey }>,
  run: RunTool,
  current: DateRange,
): Promise<ReportSection[]> {
  const previous = previousRange(current)
  const resolved = await Promise.all(sections.map(async (section) => {
    if (!(await hasPlatformData(run, section.heading, current))) return null
    const text = section.text.replace(CHART_MENTION, '').trim()
    const chart = section.chartKey === 'none' ? null : await BUILDERS[section.chartKey](run, current, previous).catch(() => null)
    return { heading: section.heading, text, ...(chart ? { chart } : {}) }
  }))
  return resolved
    .filter((section): section is ReportSection => section !== null && (section.text.length > 0 || !!section.chart))
    .sort((a, b) => REPORT_HEADINGS.indexOf(a.heading) - REPORT_HEADINGS.indexOf(b.heading))
}

export function isReportSections(value: unknown): value is { sections: ReportSection[] } {
  return !!value && typeof value === 'object' && Array.isArray((value as { sections?: unknown }).sections)
}
