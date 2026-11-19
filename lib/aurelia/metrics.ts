import type { SubscriptionHistoryRow } from './activation'

export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'churned' | 'other'

export type AureliaClient = {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: SubscriptionStatus
  rawStatus: string | null
  planSlug: string | null
  planName: string | null
  /** Inicio de la primera suscripción del cliente: es la fecha de alta. */
  startedAt: string | null
  currentPeriodStart: string | null
  endedAt: string | null
  trialEndAt: string | null
  /** Fecha de baja (ended_at de la suscripción vigente cuando está finalizada). */
  churnedAt: string | null
  /** Fecha estimada en que empezó a pagar (ver estimateActivation). */
  activatedAt: string | null
  /** Todas sus suscripciones, de la más reciente a la más vieja. */
  history: SubscriptionHistoryRow[]
  /** Valor mensual del plan vigente, sin importar el estado. */
  planMonthlyPrice: number | null
  /** Lo que aporta hoy al MRR: solo suscripciones activas o con pago pendiente. */
  mrr: number
}

export type AureliaDataset =
  | { available: false; message: string }
  | { available: true; clients: AureliaClient[]; currency: string; priceAvailable: boolean; truncated: boolean; generatedAt: string }

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Activo',
  trial: 'En prueba',
  past_due: 'Pago pendiente',
  churned: 'Baja',
  other: 'Otro',
}

export const PAYING_STATUSES: SubscriptionStatus[] = ['active', 'past_due']

export type PeriodKey = 'today' | 'last_7' | 'last_14' | 'this_month' | 'last_month' | 'last_30' | 'last_90' | 'this_year' | 'last_12m' | 'custom'

export type DateField = 'startedAt' | 'activatedAt' | 'currentPeriodStart' | 'trialEndAt' | 'churnedAt'

export const DATE_FIELD_OPTIONS: Array<{ value: DateField; label: string }> = [
  { value: 'startedAt', label: 'Fecha de alta' },
  { value: 'activatedAt', label: 'Fecha de activación' },
  { value: 'currentPeriodStart', label: 'Inicio del período actual' },
  { value: 'trialEndAt', label: 'Fin de prueba' },
  { value: 'churnedAt', label: 'Fecha de baja' },
]

/** Rango a partir de dos fechas yyyy-mm-dd, ambas incluidas, en hora local. */
export function resolveCustomRange(from: string, to: string): DateRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const start = new Date(fy, fm - 1, fd)
  const end = new Date(ty, tm - 1, td + 1)
  return end > start ? { start, end } : null
}

export function isDateInRange(value: string | null, range: DateRange) {
  return inRange(value, range)
}

export const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: 'last_7', label: 'Últimos 7 días' },
  { value: 'last_14', label: 'Últimos 14 días' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes anterior' },
  { value: 'last_30', label: 'Últimos 30 días' },
  { value: 'last_90', label: 'Últimos 90 días' },
  { value: 'this_year', label: 'Año en curso' },
  { value: 'last_12m', label: 'Últimos 12 meses' },
  { value: 'custom', label: 'Personalizado' },
]

export type DateRange = { start: Date; end: Date }

/** `custom` necesita sus fechas; sin ellas (o inválidas) cae en "Este mes". */
export function resolvePeriod(key: PeriodKey, now = new Date(), custom?: { from: string; to: string }): DateRange {
  if (key === 'custom') return (custom && resolveCustomRange(custom.from, custom.to)) ?? resolvePeriod('this_month', now)
  const startOfMonth = (year: number, month: number) => new Date(year, month, 1)
  const daysAgo = (days: number) => { const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - days + 1); return date }
  switch (key) {
    case 'today': return { start: daysAgo(1), end: now }
    case 'last_7': return { start: daysAgo(7), end: now }
    case 'last_14': return { start: daysAgo(14), end: now }
    case 'this_month': return { start: startOfMonth(now.getFullYear(), now.getMonth()), end: now }
    case 'last_month': return { start: startOfMonth(now.getFullYear(), now.getMonth() - 1), end: startOfMonth(now.getFullYear(), now.getMonth()) }
    case 'last_30': return { start: daysAgo(30), end: now }
    case 'last_90': return { start: daysAgo(90), end: now }
    case 'this_year': return { start: new Date(now.getFullYear(), 0, 1), end: now }
    case 'last_12m': return { start: startOfMonth(now.getFullYear(), now.getMonth() - 11), end: now }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Período anterior de la misma duración, para comparar. Un período de menos de
 * un día (Hoy) se compara con ayer hasta la misma hora.
 */
export function previousRange(range: DateRange): DateRange {
  const length = range.end.getTime() - range.start.getTime()
  const shift = Math.max(length, DAY_MS)
  return { start: new Date(range.start.getTime() - shift), end: new Date(range.end.getTime() - shift) }
}

const time = (value: string | null) => (value ? new Date(value).getTime() : Number.NaN)
const inRange = (value: string | null, range: DateRange) => { const t = time(value); return t >= range.start.getTime() && t < range.end.getTime() }

// Cuentas propias de Aurelia y MDK cargadas en el CRM (pruebas, uso interno).
// Se detectan por nombre o email; no cuentan como altas.
const INTERNAL_NAME = /\b(aurelia|mdk|madketing)\b/
const INTERNAL_EMAIL = /aurelia|madketing|(^|[^a-z])mdk([^a-z]|$)/

const normalize = (value: string | null) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function isInternalAccount(client: Pick<AureliaClient, 'name' | 'email'>): boolean {
  return INTERNAL_NAME.test(normalize(client.name)) || INTERNAL_EMAIL.test(normalize(client.email))
}

const isAlta = (client: AureliaClient, range: DateRange) => inRange(client.startedAt, range) && !isInternalAccount(client)
const isActivation = (client: AureliaClient, range: DateRange) => inRange(client.activatedAt, range) && !isInternalAccount(client)

/** Un cliente en prueba hoy no pagó nunca, así que no cuenta como activo en el histórico. */
export function isActiveAt(client: AureliaClient, date: Date): boolean {
  if (client.status === 'trial') return false
  const started = time(client.startedAt)
  if (!(started <= date.getTime())) return false
  if (client.status !== 'churned') return true
  const churned = time(client.churnedAt)
  return Number.isNaN(churned) ? false : churned > date.getTime()
}

export type PeriodMetrics = {
  altas: number
  activaciones: number
  bajas: number
  netas: number
  activosInicio: number
  churnRate: number | null
  mrrNuevo: number
  mrrPerdido: number
}

export function computePeriodMetrics(clients: AureliaClient[], range: DateRange): PeriodMetrics {
  const altas = clients.filter((client) => isAlta(client, range))
  const bajas = clients.filter((client) => client.status === 'churned' && inRange(client.churnedAt, range))
  const activosInicio = clients.filter((client) => isActiveAt(client, range.start)).length
  return {
    altas: altas.length,
    activaciones: clients.filter((client) => isActivation(client, range)).length,
    bajas: bajas.length,
    netas: altas.length - bajas.length,
    activosInicio,
    churnRate: activosInicio > 0 ? bajas.length / activosInicio : null,
    mrrNuevo: altas.reduce((sum, client) => sum + client.mrr, 0),
    mrrPerdido: bajas.reduce((sum, client) => sum + (client.planMonthlyPrice ?? 0), 0),
  }
}

export type KpiKey = 'mrr' | 'altas' | 'activaciones' | 'bajas' | 'netas' | 'activos' | 'past_due' | 'trial' | 'churn' | 'arpa'

export const KPI_DETAIL: Record<KpiKey, { title: string; description: string }> = {
  mrr: { title: 'Clientes que suman MRR', description: 'Suscripciones activas o con pago pendiente, ordenadas por MRR.' },
  altas: { title: 'Altas del período', description: 'Clientes cuya primera suscripción empezó en el período (sin cuentas internas de Aurelia y MDK).' },
  activaciones: { title: 'Activaciones del período', description: 'Clientes que activaron su plan actual en el período, aunque se hayan dado de alta antes (fecha estimada con su suscripción vigente).' },
  past_due: { title: 'Clientes con pago pendiente', description: 'Suscripción vigente con un cobro sin acreditar.' },
  bajas: { title: 'Bajas del período', description: 'Clientes cuya suscripción finalizó en el período.' },
  netas: { title: 'Altas y bajas del período', description: 'Altas menos bajas: los dos grupos que forman el neto.' },
  activos: { title: 'Clientes activos', description: 'Suscripción activa y al día (los de pago pendiente se ven en MRR).' },
  trial: { title: 'Clientes en prueba', description: 'Trial vigente, todavía sin aportar MRR.' },
  churn: { title: 'Bajas que forman el churn', description: 'Bajas del período sobre los activos al inicio.' },
  arpa: { title: 'Cuentas que pagan', description: 'Base del ARPA: MRR dividido por estas cuentas.' },
}

/** Clientes detrás de cada indicador, para el detalle al hacer clic. */
export function selectKpiClients(key: KpiKey, clients: AureliaClient[], range: DateRange): AureliaClient[] {
  const altas = () => clients.filter((client) => isAlta(client, range))
  const bajas = () => clients.filter((client) => client.status === 'churned' && inRange(client.churnedAt, range))
  const paying = () => clients.filter((client) => PAYING_STATUSES.includes(client.status)).sort((a, b) => b.mrr - a.mrr)
  switch (key) {
    case 'mrr':
    case 'arpa': return paying()
    case 'altas': return altas()
    case 'bajas':
    case 'churn': return bajas()
    case 'netas': return [...altas(), ...bajas().filter((client) => !isAlta(client, range))]
    case 'activos': return clients.filter((client) => client.status === 'active')
    case 'trial': return clients.filter((client) => client.status === 'trial')
    case 'activaciones': return clients.filter((client) => isActivation(client, range)).sort((a, b) => (b.activatedAt ?? '').localeCompare(a.activatedAt ?? ''))
    case 'past_due': return clients.filter((client) => client.status === 'past_due')
  }
}

export type SnapshotMetrics = { mrr: number; activos: number; pagando: number; enPrueba: number; pagoPendiente: number; arpa: number | null }

export function computeSnapshot(clients: AureliaClient[]): SnapshotMetrics {
  const paying = clients.filter((client) => PAYING_STATUSES.includes(client.status))
  const mrr = paying.reduce((sum, client) => sum + client.mrr, 0)
  return {
    mrr,
    activos: clients.filter((client) => client.status === 'active').length,
    pagando: paying.length,
    enPrueba: clients.filter((client) => client.status === 'trial').length,
    pagoPendiente: clients.filter((client) => client.status === 'past_due').length,
    arpa: paying.length ? mrr / paying.length : null,
  }
}

export type MonthlyPoint = { key: string; label: string; altas: number; bajas: number; activos: number; mrr: number }

/** Serie mensual. El MRR histórico se estima con el plan vigente de cada cliente. */
export function computeMonthlySeries(clients: AureliaClient[], months = 12, now = new Date()): MonthlyPoint[] {
  const formatter = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' })
  return Array.from({ length: months }, (_, index) => {
    const offset = months - 1 - index
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1)
    const end = nextMonth > now ? now : nextMonth
    const range = { start, end }
    const activeAtEnd = clients.filter((client) => isActiveAt(client, end))
    return {
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: formatter.format(start).replace('.', ''),
      altas: clients.filter((client) => isAlta(client, range)).length,
      bajas: clients.filter((client) => client.status === 'churned' && inRange(client.churnedAt, range)).length,
      activos: activeAtEnd.length,
      mrr: activeAtEnd.reduce((sum, client) => sum + (client.planMonthlyPrice ?? 0), 0),
    }
  })
}

export type PlanBreakdownRow = { plan: string; clientes: number; mrr: number }

export function computePlanBreakdown(clients: AureliaClient[]): PlanBreakdownRow[] {
  const groups = new Map<string, PlanBreakdownRow>()
  for (const client of clients) {
    if (!PAYING_STATUSES.includes(client.status)) continue
    const plan = client.planName ?? client.planSlug ?? 'Sin plan'
    const row = groups.get(plan) ?? { plan, clientes: 0, mrr: 0 }
    row.clientes += 1
    row.mrr += client.mrr
    groups.set(plan, row)
  }
  return [...groups.values()].sort((a, b) => b.mrr - a.mrr || b.clientes - a.clientes)
}

export function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${Math.round(value).toLocaleString('es-AR')}`
  }
}

export function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}
