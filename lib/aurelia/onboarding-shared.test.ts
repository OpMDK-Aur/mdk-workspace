import { describe, expect, it } from 'vitest'
import type { AureliaClient } from './metrics'
import { daysSince, matchOnboarding, type OnboardingOpportunity } from './onboarding-shared'

const client = (overrides: Partial<AureliaClient> & Pick<AureliaClient, 'id' | 'name'>): AureliaClient => ({
  email: null, phone: null, status: 'active', rawStatus: 'active', planSlug: 'pro', planName: 'Pro', startedAt: null,
  currentPeriodStart: null, endedAt: null, trialEndAt: null, churnedAt: null, activatedAt: null, history: [], planMonthlyPrice: 100, mrr: 100,
  ...overrides,
})

const opportunity = (overrides: Partial<OnboardingOpportunity> & Pick<OnboardingOpportunity, 'id' | 'title'>): OnboardingOpportunity => ({
  stageId: 's1', stageAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  contact: { id: null, name: null, email: null, phone: null },
  ...overrides,
})

const stages = [{ id: 's1', name: 'Kickoff', position: 0 }, { id: 's2', name: 'Configuración', position: 1 }]

describe('matchOnboarding', () => {
  it('asocia por email antes que por nombre', () => {
    const { matches } = matchOnboarding(
      [client({ id: 'c1', name: 'Turismo Mirs', email: 'Mutual@Gmail.com' })],
      { available: true, pipelineName: 'Onboarding', stages, opportunities: [
        opportunity({ id: 'o1', title: 'Turismo Mirs', stageId: 's1' }),
        opportunity({ id: 'o2', title: 'Otro título', stageId: 's2', contact: { id: 'ct', name: null, email: 'mutual@gmail.com', phone: null } }),
      ] },
    )
    expect(matches.get('c1')?.id).toBe('o2')
    expect(matches.get('c1')?.matchedBy).toBe('email')
    expect(matches.get('c1')?.stage?.name).toBe('Configuración')
  })

  it('compara nombres sin tildes, mayúsculas ni signos', () => {
    const { matches, unmatched } = matchOnboarding(
      [client({ id: 'c1', name: 'Pirerayen - Citroën' })],
      { available: true, pipelineName: 'Onboarding', stages, opportunities: [opportunity({ id: 'o1', title: 'PIRERAYEN CITROEN' }), opportunity({ id: 'o2', title: 'Sin cliente' })] },
    )
    expect(matches.get('c1')?.matchedBy).toBe('name')
    expect(unmatched.map((item) => item.id)).toEqual(['o2'])
  })

  it('usa la oportunidad más reciente cuando hay varias', () => {
    const { matches } = matchOnboarding(
      [client({ id: 'c1', name: 'Belkiare' })],
      { available: true, pipelineName: 'Onboarding', stages, opportunities: [
        opportunity({ id: 'old', title: 'Belkiare', updatedAt: '2026-01-01T00:00:00Z' }),
        opportunity({ id: 'new', title: 'Belkiare', updatedAt: '2026-03-01T00:00:00Z', stageId: 's2' }),
      ] },
    )
    expect(matches.get('c1')?.id).toBe('new')
  })

  it('asocia por teléfono ignorando el prefijo de país', () => {
    const { matches } = matchOnboarding(
      [client({ id: 'c1', name: 'Cliente', phone: '5493425103425' })],
      { available: true, pipelineName: 'Onboarding', stages, opportunities: [opportunity({ id: 'o1', title: 'X', contact: { id: 'ct', name: null, email: null, phone: '+54 342 510-3425' } })] },
    )
    expect(matches.get('c1')?.matchedBy).toBe('phone')
  })
})

describe('daysSince', () => {
  it('cuenta días completos', () => {
    expect(daysSince('2026-11-10T00:00:00Z', new Date('2026-11-20T12:00:00Z').getTime())).toBe(10)
    expect(daysSince(null)).toBeNull()
  })
})
