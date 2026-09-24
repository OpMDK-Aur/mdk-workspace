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

// Regresión: campaña de leads sin conversiones reales en el período no debe
// mostrar sus clics/visitas a landing incidentales como "Resultados" -- debe
// quedar en 0, igual que el "—" que muestra Meta Ads Manager.
test('campaña de leads sin conversiones reales no cae a clics/landing como resultado', () => {
  const actions = [
    { action_type: 'link_click', value: '265' },
    { action_type: 'landing_page_view', value: '180' },
  ]
  assert.deepEqual(normalizeMetaResult('OUTCOME_LEADS', actions), {
    results: 0, resultType: 'unknown', sourceActionType: null, leads: 0, conversions: 0,
  })
})

test('campaña de tráfico sin conversiones reales sí usa clics como resultado', () => {
  const result = normalizeMetaResult('OUTCOME_TRAFFIC', [{ action_type: 'link_click', value: '265' }])
  assert.equal(result.results, 265)
  assert.equal(result.resultType, 'link_click')
})
