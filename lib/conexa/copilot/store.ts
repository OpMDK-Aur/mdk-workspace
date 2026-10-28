import { getExecutor, type ExecutionRecord } from '@/lib/conexa/executors'
import { seedDecisions, seedLearnings, seedPlays, seedRecommendations } from './seed'
import type { CopilotPlatform, DashboardFilters, DashboardResponse, Decision, Learning, Play, Recommendation, RecommendationStatus } from './types'

/**
 * Stub en memoria hasta que exista la persistencia real. Vive por instancia del servidor,
 * así que se reinicia en cada deploy o arranque en frío.
 */
type ClientState = { recommendations: Recommendation[]; plays: Play[]; decisions: Decision[]; learnings: Learning[]; executions: Map<string, ExecutionRecord> }

const globalStore = globalThis as unknown as { __conexaCopilot?: Map<string, ClientState> }
const states = (globalStore.__conexaCopilot ??= new Map())

export class CopilotError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

function state(clientId: string): ClientState {
  let current = states.get(clientId)
  if (!current) {
    current = { recommendations: seedRecommendations(clientId), plays: seedPlays(), decisions: seedDecisions(clientId), learnings: seedLearnings(clientId), executions: new Map() }
    states.set(clientId, current)
  }
  return current
}

function findRecommendation(id: string) {
  for (const current of states.values()) {
    const rec = current.recommendations.find((item) => item.id === id)
    if (rec) return { rec, current }
  }
  throw new CopilotError('Acción no encontrada', 404)
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

export function listRecommendations(clientId: string, status?: RecommendationStatus) {
  const current = state(clientId)
  return {
    recommendations: status ? current.recommendations.filter((item) => item.status === status) : current.recommendations,
    plays: current.plays,
    context: { objective: 'Ventas sobre volumen de leads', decisionsCount: current.decisions.length, sources: ['Meta', 'Google Ads', 'GA4', 'CRM', 'GTM'] },
  }
}

export function editRecommendation(id: string, after: string) {
  const { rec } = findRecommendation(id)
  if (rec.status !== 'pending') throw new CopilotError('Solo se pueden editar acciones pendientes')
  Object.assign(rec, { after: after.trim(), diff: 'Editado a mano', edited: true, version: rec.version + 1 })
  return rec
}

const parseAmount = (value: string) => {
  const match = value.match(/-?[\d.]+(?:,\d+)?/)
  return match ? Number(match[0].replace(/\./g, '').replace(',', '.')) : null
}
const formatAmount = (template: string, amount: number) => template.replace(/-?[\d.]+(?:,\d+)?/, Math.round(amount).toLocaleString('es-AR'))

export function reformulateRecommendation(id: string, instruction: string) {
  const { rec } = findRecommendation(id)
  if (rec.status !== 'pending') throw new CopilotError('Solo se pueden reformular acciones pendientes')
  const text = instruction.trim()
  if (!text) throw new CopilotError('Falta la instrucción')

  const lower = text.toLowerCase()
  const factor = lower.includes('conservadora') ? 0.5 : lower.includes('agresiva') ? 1.5 : null
  const before = parseAmount(rec.before)
  const after = parseAmount(rec.after)
  let note = `Se tuvo en cuenta: "${text}".`

  if (factor && before !== null && after !== null) {
    const next = before + (after - before) * factor
    const delta = next - before
    rec.after = formatAmount(rec.after, next)
    rec.diff = formatAmount(rec.diff, Math.abs(delta))
    note = `${factor < 1 ? 'Más conservadora' : 'Más agresiva'}: el cambio pasa a ${rec.diff}.`
  } else if (lower.includes('7 días')) {
    rec.after = `${rec.after.replace(/ · por 7 días$/, '')} · por 7 días`
    note = 'Se aplica por 7 días y después vuelve al valor anterior.'
  }

  Object.assign(rec, { version: rec.version + 1, revisionNote: note })
  return rec
}

function recordDecision(current: ClientState, rec: Recommendation, by: string, scheduled: boolean): Decision {
  const decision: Decision = {
    id: newId('dec'), recId: rec.id, date: new Date().toISOString(), by,
    decision: rec.edited ? 'Editada y aprobada' : 'Aprobada', title: rec.title, platform: rec.platform, type: rec.type,
    recommended: rec.diff, executed: rec.after, before: rec.before, after: rec.after,
    revertible: !scheduled, result: scheduled ? { state: 'scheduled' } : { state: 'measuring', day: 0, metric: 'Conexa mide el resultado a 7 días' },
  }
  current.decisions.unshift(decision)
  return decision
}

async function execute(current: ClientState, rec: Recommendation) {
  current.executions.set(rec.id, await getExecutor(rec.platform).apply(rec))
  rec.status = 'executed'
}

export async function approveRecommendation(id: string, mode: 'now' | 'schedule', by: string, slot?: string) {
  const { rec, current } = findRecommendation(id)
  if (rec.status !== 'pending') throw new CopilotError('La acción ya fue resuelta')
  if (mode === 'schedule') {
    if (!slot?.trim()) throw new CopilotError('Falta el horario')
    Object.assign(rec, { status: 'scheduled', slot: slot.trim() })
    return { recommendation: rec, decision: recordDecision(current, rec, by, true) }
  }
  await execute(current, rec)
  return { recommendation: rec, decision: recordDecision(current, rec, by, false) }
}

export function rejectRecommendation(id: string, reason: string, by: string) {
  const { rec, current } = findRecommendation(id)
  if (rec.status !== 'pending') throw new CopilotError('La acción ya fue resuelta')
  Object.assign(rec, { status: 'rejected', rejectReason: reason })
  current.decisions.unshift({ id: newId('dec'), recId: rec.id, date: new Date().toISOString(), by, decision: 'Rechazada', title: rec.title, platform: rec.platform, type: rec.type, recommended: rec.diff, revertible: false, result: { state: 'none' } })
  const learning: Learning = { id: newId('lrn'), date: new Date().toISOString(), isNew: true, text: `"${rec.title}" se descartó: ${reason.toLowerCase()}.` }
  current.learnings.unshift(learning)
  return { recommendation: rec, learning }
}

export async function runScheduledNow(id: string) {
  const { rec, current } = findRecommendation(id)
  if (rec.status !== 'scheduled') throw new CopilotError('La acción no está programada')
  await execute(current, rec)
  rec.slot = undefined
  const decision = current.decisions.find((item) => item.recId === rec.id && item.result.state === 'scheduled')
  if (decision) Object.assign(decision, { date: new Date().toISOString(), revertible: true, result: { state: 'measuring', day: 0, metric: 'Conexa mide el resultado a 7 días' } })
  return rec
}

export function cancelScheduled(id: string) {
  const { rec, current } = findRecommendation(id)
  if (rec.status !== 'scheduled') throw new CopilotError('La acción no está programada')
  Object.assign(rec, { status: 'pending', slot: undefined })
  current.decisions = current.decisions.filter((item) => !(item.recId === rec.id && item.result.state === 'scheduled'))
  return rec
}

export async function revertDecision(id: string) {
  for (const current of states.values()) {
    const decision = current.decisions.find((item) => item.id === id)
    if (!decision) continue
    if (!decision.revertible) throw new CopilotError('Esta decisión no se puede revertir')
    const execution = current.executions.get(decision.recId)
    if (execution) await getExecutor(execution.platform).revert(execution)
    Object.assign(decision, { decision: 'Revertida', revertible: false, after: decision.before, result: { state: 'none', metric: `Restaurado a ${decision.before}` } })
    return decision
  }
  throw new CopilotError('Decisión no encontrada', 404)
}

export function listLearnings(clientId: string) {
  const current = state(clientId)
  return { decisions: current.decisions, learnings: current.learnings }
}

const isExecuted = (item: Decision) => (item.decision === 'Aprobada' || item.decision === 'Editada y aprobada') && item.result.state !== 'scheduled'

export function dashboard(clientId: string, filters: DashboardFilters): DashboardResponse {
  const all = state(clientId).decisions
  const since = Date.now() - Number(filters.range) * 86_400_000
  const rows = all.filter((item) => new Date(item.date).getTime() >= since && (!filters.type || item.type === filters.type) && (!filters.platform || item.platform === filters.platform) && (!filters.by || item.by === filters.by))
  const executed = rows.filter(isExecuted)
  const ok = rows.filter((item) => item.result.state === 'ok').length
  const bad = rows.filter((item) => item.result.state === 'bad').length
  const count = <K extends string>(keys: (K | undefined)[]) => Object.entries(keys.reduce<Record<string, number>>((acc, key) => (key ? { ...acc, [key]: (acc[key] ?? 0) + 1 } : acc), {})).map(([key, value]) => ({ key: key as K, count: value })).sort((a, b) => b.count - a.count)

  return {
    kpis: { executed: executed.length, successRate: ok + bad ? Math.round((ok / (ok + bad)) * 100) : 0, rejected: rows.filter((item) => item.decision === 'Rechazada').length, measuring: rows.filter((item) => item.result.state === 'measuring').length },
    byPlatform: count<CopilotPlatform>(executed.map((item) => item.platform)),
    byType: count(executed.map((item) => item.type)),
    rows,
    options: { types: [...new Set(all.map((item) => item.type).filter(Boolean) as string[])], people: [...new Set(all.map((item) => item.by))] },
  }
}
