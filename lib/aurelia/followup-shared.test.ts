import { describe, expect, it } from 'vitest'
import { computeNps, emptyFollowup, latestSurvey, parseDateOnly, parseScore } from './followup-shared'

const withNotes = (id: string, notes: Array<number | null>) => {
  const followup = emptyFollowup(id)
  followup.encuestas = followup.encuestas.map((survey, index) => ({ ...survey, nota: notes[index] ?? null }))
  return followup
}

describe('followup helpers', () => {
  it('takes the last survey with a score', () => {
    expect(latestSurvey(withNotes('a', [3, 5, null, null]))?.index).toBe(1)
    expect(latestSurvey(withNotes('b', [null, null, null, null]))).toBeNull()
  })

  it('computes NPS over the latest score of each client', () => {
    const nps = computeNps([withNotes('a', [2, 5]), withNotes('b', [5]), withNotes('c', [4]), withNotes('d', [3]), withNotes('e', [])])
    expect(nps).toEqual({ respuestas: 4, promotores: 2, pasivos: 1, detractores: 1, score: 25 })
    expect(computeNps([]).score).toBeNull()
  })

  it('validates dates and scores', () => {
    expect(parseDateOnly('2026-11-24')).toBe('2026-11-24')
    expect(parseDateOnly('')).toBeNull()
    expect(() => parseDateOnly('2026-02-30')).toThrow()
    expect(parseScore('4')).toBe(4)
    expect(parseScore(null)).toBeNull()
    expect(() => parseScore(6)).toThrow()
    expect(() => parseScore(0)).toThrow()
    expect(() => parseScore(3.5)).toThrow()
  })
})
