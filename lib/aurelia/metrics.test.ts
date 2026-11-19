import { describe, expect, it } from 'vitest'
import { computeMonthlySeries, computePeriodMetrics, computePlanBreakdown, computeSnapshot, selectKpiClients, type AureliaClient } from './metrics'

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

  it('builds a monthly series ending in the current month', () => {
    const series = computeMonthlySeries(clients, 3, new Date('2026-11-19T12:00:00Z'))
    expect(series).toHaveLength(3)
    expect(series[2]).toMatchObject({ key: '2026-11', altas: 2, bajas: 1, activos: 3 })
  })
})
