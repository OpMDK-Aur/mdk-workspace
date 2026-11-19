import { describe, expect, it } from 'vitest'
import { computeMonthlySeries, computePeriodMetrics, computePlanBreakdown, computeSnapshot, isInternalAccount, previousRange, resolveCustomRange, resolvePeriod, selectKpiClients, type AureliaClient } from './metrics'

const base: Omit<AureliaClient, 'id' | 'status' | 'startedAt' | 'churnedAt' | 'mrr'> = {
  name: 'Cliente', email: null, phone: null, rawStatus: null, planSlug: 'pro', planName: 'Pro',
  currentPeriodStart: null, endedAt: null, trialEndAt: null, planMonthlyPrice: 100,
}
const client = (overrides: Partial<AureliaClient> & Pick<AureliaClient, 'id' | 'status' | 'startedAt'>): AureliaClient => ({ ...base, churnedAt: null, mrr: 0, ...overrides })

const clients: AureliaClient[] = [
  client({ id: 'a', status: 'active', startedAt: '2026-01-10T00:00:00Z', mrr: 100 }),
  client({ id: 'b', status: 'active', startedAt: '2026-11-05T00:00:00Z', mrr: 100 }),
  client({ id: 'c', status: 'churned', startedAt: '2026-02-01T00:00:00Z', churnedAt: '2026-11-03T00:00:00Z' }),
  client({ id: 'd', status: 'trial', startedAt: '2026-11-10T00:00:00Z' }),
  client({ id: 'e', status: 'past_due', startedAt: '2026-03-01T00:00:00Z', mrr: 50, planName: 'Basic', planMonthlyPrice: 50 }),
]

describe('Aurelia metrics', () => {
  const november = { start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-12-01T00:00:00Z') }

  it('counts altas, bajas and churn over clients active at the start', () => {
    const metrics = computePeriodMetrics(clients, november)
    expect(metrics.altas).toBe(2)
    expect(metrics.bajas).toBe(1)
    expect(metrics.netas).toBe(1)
    expect(metrics.activosInicio).toBe(3)
    expect(metrics.churnRate).toBeCloseTo(1 / 3)
    expect(metrics.mrrPerdido).toBe(100)
  })

  it('sums MRR only for paying subscriptions', () => {
    const snapshot = computeSnapshot(clients)
    expect(snapshot.mrr).toBe(250)
    expect(snapshot.pagando).toBe(3)
    expect(snapshot.enPrueba).toBe(1)
    expect(snapshot.arpa).toBeCloseTo(250 / 3)
  })

  it('groups paying MRR by plan', () => {
    expect(computePlanBreakdown(clients)).toEqual([
      { plan: 'Pro', clientes: 2, mrr: 200 },
      { plan: 'Basic', clientes: 1, mrr: 50 },
    ])
  })

  it('lists the clients behind each KPI', () => {
    const ids = (key: Parameters<typeof selectKpiClients>[0]) => selectKpiClients(key, clients, november).map((row) => row.id)
    expect(ids('altas')).toEqual(['b', 'd'])
    expect(ids('bajas')).toEqual(['c'])
    expect(ids('netas')).toEqual(['b', 'd', 'c'])
    expect(ids('mrr')).toEqual(['a', 'b', 'e'])
    expect(ids('activos')).toEqual(['a', 'b'])
    expect(ids('trial')).toEqual(['d'])
  })

  it('excludes Aurelia and MDK internal accounts from altas', () => {
    const withInternal = [
      ...clients,
      client({ id: 'i1', status: 'active', startedAt: '2026-11-06T00:00:00Z', name: 'Aurelia Demo', mrr: 100 }),
      client({ id: 'i2', status: 'trial', startedAt: '2026-11-07T00:00:00Z', name: 'Prueba', email: 'ops@madketing.io' }),
      client({ id: 'i3', status: 'active', startedAt: '2026-11-08T00:00:00Z', name: 'Equipo MDK', mrr: 100 }),
    ]
    expect(computePeriodMetrics(withInternal, november).altas).toBe(2)
    expect(selectKpiClients('altas', withInternal, november).map((row) => row.id)).toEqual(['b', 'd'])
    expect(computeMonthlySeries(withInternal, 1, new Date('2026-11-19T12:00:00Z'))[0].altas).toBe(2)
  })

  it('detects internal accounts by name or email only on whole words', () => {
    expect(isInternalAccount({ name: 'Soy Aurelia', email: null })).toBe(true)
    expect(isInternalAccount({ name: 'Cliente', email: 'hola@soyaurelia.com' })).toBe(true)
    expect(isInternalAccount({ name: 'Cliente', email: 'admin@mdk.com.ar' })).toBe(true)
    expect(isInternalAccount({ name: 'Ferretería Admdker', email: 'ventas@ferre.com' })).toBe(false)
  })

  it('resolves today, last 7 and last 14 days from local midnight', () => {
    const now = new Date(2026, 10, 19, 15, 30)
    expect(resolvePeriod('today', now)).toEqual({ start: new Date(2026, 10, 19), end: now })
    expect(resolvePeriod('last_7', now).start).toEqual(new Date(2026, 10, 13))
    expect(resolvePeriod('last_14', now).start).toEqual(new Date(2026, 10, 6))
    expect(previousRange(resolvePeriod('today', now))).toEqual({ start: new Date(2026, 10, 18), end: new Date(2026, 10, 18, 15, 30) })
    const week = resolvePeriod('last_7', now)
    expect(previousRange(week)).toEqual({ start: new Date(week.start.getTime() - (now.getTime() - week.start.getTime())), end: week.start })
  })

  it('resolves custom ranges including both days', () => {
    expect(resolveCustomRange('2026-11-01', '2026-11-15')).toEqual({ start: new Date(2026, 10, 1), end: new Date(2026, 10, 16) })
    expect(resolveCustomRange('2026-11-15', '2026-11-01')).toBeNull()
    const now = new Date(2026, 10, 19, 10)
    expect(resolvePeriod('custom', now, { from: 'x', to: 'y' })).toEqual(resolvePeriod('this_month', now))
  })

  it('builds a monthly series ending in the current month', () => {
    const series = computeMonthlySeries(clients, 3, new Date('2026-11-19T12:00:00Z'))
    expect(series).toHaveLength(3)
    expect(series[2]).toMatchObject({ key: '2026-11', altas: 2, bajas: 1, activos: 3 })
  })
})
