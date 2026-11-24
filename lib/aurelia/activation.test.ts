import { describe, expect, it } from 'vitest'
import { estimateActivation, type SubscriptionHistoryRow } from './activation'

const row = (overrides: Partial<SubscriptionHistoryRow>): SubscriptionHistoryRow => ({
  planName: 'Pro', status: 'active', rawStatus: 'active', createdAt: '2026-04-23T10:00:00Z',
  currentPeriodStart: null, trialEndAt: null, endedAt: null, monthlyPrice: 100, ...overrides,
})
const now = new Date('2026-11-19T15:00:00Z').getTime()

describe('estimateActivation', () => {
  it('uses the trial end when the same subscription moved from trial to active', () => {
    expect(estimateActivation([row({ trialEndAt: '2026-11-19T09:00:00Z' })], now)).toBe('2026-11-19T09:00:00Z')
  })

  it('ignores an expired trial and takes the paid subscription created later', () => {
    const history = [
      row({ createdAt: '2026-11-19T12:00:00Z' }),
      row({ status: 'churned', rawStatus: 'canceled', trialEndAt: '2026-05-07T00:00:00Z', endedAt: '2026-05-07T00:00:00Z' }),
    ]
    expect(estimateActivation(history, now)).toBe('2026-11-19T12:00:00Z')
  })

  it('uses the most recent paid subscription, not the first one', () => {
    const history = [
      row({ createdAt: '2026-11-19T12:00:00Z' }),
      row({ status: 'churned', rawStatus: 'canceled', trialEndAt: '2026-04-30T00:00:00Z', endedAt: '2026-08-01T00:00:00Z' }),
    ]
    expect(estimateActivation(history, now)).toBe('2026-11-19T12:00:00Z')
  })

  it('ignores free plans before the upgrade', () => {
    const history = [row({ createdAt: '2026-11-19T12:00:00Z' }), row({ monthlyPrice: 0, status: 'churned', endedAt: '2026-11-19T12:00:00Z' })]
    expect(estimateActivation(history, now)).toBe('2026-11-19T12:00:00Z')
  })

  it('returns null while the client is still on trial', () => {
    expect(estimateActivation([row({ status: 'trial', trialEndAt: '2026-11-30T00:00:00Z' })], now)).toBeNull()
  })

  it('falls back to the creation date when there is no trial', () => {
    expect(estimateActivation([row({})], now)).toBe('2026-04-23T10:00:00Z')
  })

  it('no cuenta como pago una suscripción incompleta dada de baja', () => {
    const history = [row({ status: 'churned', rawStatus: 'incomplete_expired', trialEndAt: null, endedAt: '2026-11-19T12:00:00Z' })]
    expect(estimateActivation(history, now)).toBeNull()
    expect(estimateActivation([row({ status: 'churned', rawStatus: 'incompleto', trialEndAt: null, endedAt: '2026-11-19T12:00:00Z' })], now)).toBeNull()
  })
})
