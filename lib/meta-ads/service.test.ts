import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMetaResult } from './service'

test('normaliza lead', () => assert.deepEqual(normalizeMetaResult('OUTCOME_LEADS', [{ action_type: 'lead', value: '10' }]), { results: 10, resultType: 'lead', sourceActionType: 'lead', leads: 10, conversions: 10 }))
test('normaliza link click sin leads', () => assert.deepEqual(normalizeMetaResult('OUTCOME_TRAFFIC', [{ action_type: 'link_click', value: '300' }]), { results: 300, resultType: 'link_click', sourceActionType: 'link_click', leads: 0, conversions: 0 }))
test('normaliza landing page view', () => assert.equal(normalizeMetaResult('OUTCOME_TRAFFIC', [{ action_type: 'landing_page_view', value: '150' }]).results, 150))
test('normaliza purchase como conversion', () => assert.deepEqual(normalizeMetaResult('OUTCOME_SALES', [{ action_type: 'purchase', value: '8' }]), { results: 8, resultType: 'purchase', sourceActionType: 'purchase', leads: 0, conversions: 8 }))
test('normaliza reach', () => assert.equal(normalizeMetaResult('OUTCOME_AWARENESS', [{ action_type: 'reach', value: '900' }]).results, 900))
test('sin resultado nunca produce undefined', () => assert.deepEqual(normalizeMetaResult('OUTCOME_AWARENESS', []), { results: 0, resultType: 'unknown', sourceActionType: null, leads: 0, conversions: 0 }))
