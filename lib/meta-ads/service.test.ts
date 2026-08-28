import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMetaResult } from './service'

const cases = [
  ['messaging', 'OUTCOME_ENGAGEMENT', [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' }], 'messaging_conversation_started', 12, 0, 12],
  ['lead', 'OUTCOME_LEADS', [{ action_type: 'lead', value: '10' }], 'lead', 10, 10, 10],
  ['purchase', 'OUTCOME_SALES', [{ action_type: 'purchase', value: '8' }], 'purchase', 8, 0, 8],
  ['landing page', 'OUTCOME_TRAFFIC', [{ action_type: 'landing_page_view', value: '150' }], 'landing_page_view', 150, 0, 0],
  ['link clicks', 'OUTCOME_TRAFFIC', [{ action_type: 'link_click', value: '300' }], 'link_click', 300, 0, 0],
  ['reach', 'OUTCOME_AWARENESS', [{ action_type: 'reach', value: '900' }], 'reach', 900, 0, 0],
] as const

for (const [name, objective, actions, resultType, results, leads, conversions] of cases) {
  test(`normaliza ${name}`, () => {
    const result = normalizeMetaResult(objective, [...actions])
    assert.equal(result.resultType, resultType)
    assert.equal(result.results, results)
    assert.equal(result.leads, leads)
    assert.equal(result.conversions, conversions)
    assert.notEqual(result.results, undefined)
    assert.equal(Number.isFinite(result.results), true)
  })
}

test('sin resultado produce unknown y cero', () => assert.deepEqual(normalizeMetaResult('OUTCOME_AWARENESS', []), { results: 0, resultType: 'unknown', sourceActionType: null, leads: 0, conversions: 0 }))
