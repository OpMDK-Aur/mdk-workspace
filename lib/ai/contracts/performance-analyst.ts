import { z } from 'zod'

export const PERFORMANCE_ANALYST_CONFIG_VERSION = '1.0.0'

export const ConfidenceSchema = z.enum(['alta', 'media', 'baja'])
export const SufficiencySchema = z.enum(['suficiente', 'parcial', 'insuficiente'])
export const SeveritySchema = z.enum(['alta', 'media', 'baja', 'informativa'])
export const CauseDimensionSchema = z.enum([
  'eficiencia',
  'volumen',
  'relevancia',
  'conversion',
  'restriccion_presupuesto',
  'cobertura',
  'tracking',
  'datos_insuficientes',
])
export const LeverSchema = z.enum(['presupuesto', 'segmentacion', 'creatividad', 'landing_page', 'puja', 'tracking', 'conversion', 'datos'])
export const DirectionSchema = z.enum(['aumentar', 'reducir', 'mantener', 'optimizar', 'investigar', 'no_escalar'])
export const PrioritySchema = z.enum(['alta', 'media', 'baja'])

export const EntitySchema = z.object({
  client_id: z.string(),
  platform: z.enum(['google', 'meta', 'mixed']),
  account_ids: z.array(z.string()),
  campaign_ids: z.array(z.string()).nullable(),
  period: z.object({ from: z.string(), to: z.string() }),
})

export const EvidenceSchema = z.object({
  id: z.string(),
  metric: z.string().nullable(),
  value: z.number().nullable(),
  comparison_value: z.number().nullable(),
  variation_pct: z.number().nullable(),
  source: z.enum(['google', 'meta', 'crm', 'user', 'derived', 'other']).nullable(),
  account_id: z.string().nullable(),
  campaign_id: z.string().nullable(),
  note: z.string().nullable(),
})

export const FindingSchema = z.object({
  id: z.string(),
  dimension_causa: CauseDimensionSchema,
  descripcion: z.string(),
  severidad: SeveritySchema,
  evidencia: z.array(EvidenceSchema),
  evidence_ids: z.array(z.string()),
  confianza: ConfidenceSchema,
})

export const RecommendationSchema = z.object({
  id: z.string(),
  descripcion: z.string(),
  palanca: LeverSchema,
  direccion: DirectionSchema,
  prioridad: PrioritySchema,
  finding_ids: z.array(z.string()),
  evidence_ids: z.array(z.string()),
  confianza: ConfidenceSchema,
})

export const MissingRequirementSchema = z.object({
  id: z.string(),
  descripcion: z.string(),
  impacto: z.string().nullable(),
})

export const CaveatSchema = z.object({
  id: z.string(),
  descripcion: z.string(),
  source: z.enum(['google', 'meta', 'crm', 'user', 'derived', 'other']).nullable(),
})

export const SpecialistOutputSchema = z.object({
  agent_slug: z.literal('performance-analyst'),
  config_version: z.string(),
  entity: EntitySchema,
  period: z.object({ from: z.string(), to: z.string() }),
  sufficiency: SufficiencySchema,
  missing: z.array(MissingRequirementSchema),
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceSchema),
  findings: z.array(FindingSchema),
  recommendations: z.array(RecommendationSchema),
  caveats: z.array(CaveatSchema),
})

export function normalizeSpecialistOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const value = raw as Record<string, unknown>
  const entity = value.entity ?? value.entidad
  const output = {
    ...value,
    entity,
    missing: value.missing ?? value.faltantes ?? [],
    confidence: value.confidence ?? value.confianza,
    findings: value.findings ?? value.hallazgos ?? [],
    recommendations: value.recommendations ?? value.recomendaciones ?? [],
    sufficiency: value.sufficiency ?? value.suficiencia,
    evidence: value.evidence ?? [],
    caveats: value.caveats ?? [],
  }
  return output
}

export type SpecialistOutput = z.infer<typeof SpecialistOutputSchema>

export const PaidMediaSnapshotSchema = z.object({
  client_id: z.string(),
  platform: z.enum(['google', 'meta']),
  account_id: z.string(),
  account_name: z.string().nullable(),
  currency: z.string().nullable(),
  period: z.object({ from: z.string(), to: z.string() }),
  metrics: z.record(z.string(), z.unknown()),
  conversion_actions: z.array(z.record(z.string(), z.unknown())),
  conversion_actions_available: z.boolean(),
  conversion_actions_error: z.string().nullable(),
  change_history: z.array(z.record(z.string(), z.unknown())),
  change_history_available: z.boolean(),
  change_history_error: z.string().nullable(),
  campaigns: z.array(z.record(z.string(), z.unknown())),
})

export type PaidMediaSnapshot = z.infer<typeof PaidMediaSnapshotSchema>

export const PaidMediaChangeEventSchema = z.object({
  platform: z.enum(['google', 'meta']), account_id: z.string(), occurred_at: z.string(),
  actor: z.object({ id: z.string().nullable(), name: z.string().nullable(), email: z.string().nullable() }),
  source: z.string().min(1),
  entity: z.object({ type: z.string(), id: z.string().nullable(), name: z.string().nullable() }),
  operation: z.string(),
  changed_fields: z.array(z.object({ field: z.string(), field_category: z.enum(['budget', 'status', 'bidding', 'targeting', 'creative', 'conversion', 'schedule', 'other']), old_value: z.string().nullable(), new_value: z.string().nullable() })),
  metadata: z.object({ resource_name: z.string().nullable(), client_type: z.string().nullable(), raw_change_resource_type: z.string().nullable() }).catchall(z.unknown()),
})
export type PaidMediaChangeEvent = z.infer<typeof PaidMediaChangeEventSchema>

export type AnalysisPeriodRole = 'current' | 'comparison'
export type ComparisonDefinition = {
  type: 'previous_period' | 'explicit'
  current: { from: string; to: string }
  comparison: { from: string; to: string }
}

export type AnalysisRunState = {
  currentSnapshots: PaidMediaSnapshot[]
  comparisonSnapshots: PaidMediaSnapshot[]
  changeHistory: PaidMediaChangeEvent[]
  specialistOutputs: SpecialistOutput[]
  comparisonDefinition?: ComparisonDefinition
}

export function upsertChangeHistory(state: AnalysisRunState, events: PaidMediaChangeEvent[]) {
  const seen = new Set(state.changeHistory.map((event) => `${event.platform}:${event.account_id}:${event.metadata.resource_name ?? ''}:${event.occurred_at}:${event.operation}`))
  for (const event of events) { const key = `${event.platform}:${event.account_id}:${event.metadata.resource_name ?? ''}:${event.occurred_at}:${event.operation}`; if (!seen.has(key)) { state.changeHistory.push(event); seen.add(key) } }
}

export type ComparableMetric = { current: number; comparison: number; delta: number; delta_pct: number | null }

function periodKey(period: { from: string; to: string }) {
  return `${period.from}:${period.to}`
}

export function getSnapshotRole(state: AnalysisRunState, snapshot: PaidMediaSnapshot): AnalysisPeriodRole {
  return state.comparisonDefinition && periodKey(snapshot.period) === periodKey(state.comparisonDefinition.comparison) ? 'comparison' : 'current'
}

export function upsertPaidMediaSnapshot(state: AnalysisRunState, snapshot: PaidMediaSnapshot) {
  const role = getSnapshotRole(state, snapshot)
  const target = role === 'comparison' ? state.comparisonSnapshots : state.currentSnapshots
  const index = target.findIndex((current) => current.platform === snapshot.platform && current.account_id === snapshot.account_id && current.period.from === snapshot.period.from && current.period.to === snapshot.period.to)
  if (index === -1) target.push(snapshot)
  else target[index] = snapshot
}

export function compareMetric(current: unknown, comparison: unknown): ComparableMetric | null {
  const currentValue = Number(current)
  const comparisonValue = Number(comparison)
  if (!Number.isFinite(currentValue) || !Number.isFinite(comparisonValue)) return null
  return { current: currentValue, comparison: comparisonValue, delta: currentValue - comparisonValue, delta_pct: comparisonValue === 0 ? null : ((currentValue - comparisonValue) / Math.abs(comparisonValue)) * 100 }
}

export function buildCampaignComparisons(current: PaidMediaSnapshot[], comparison: PaidMediaSnapshot[]) {
  const rows = new Map<string, { current?: Record<string, unknown>; comparison?: Record<string, unknown> }>()
  for (const snapshot of current) for (const campaign of snapshot.campaigns) { const id = String(campaign.id ?? campaign.campaign_id ?? campaign.name ?? 'unknown'); rows.set(id, { ...rows.get(id), current: campaign }) }
  for (const snapshot of comparison) for (const campaign of snapshot.campaigns) { const id = String(campaign.id ?? campaign.campaign_id ?? campaign.name ?? 'unknown'); rows.set(id, { ...rows.get(id), comparison: campaign }) }
  return [...rows.entries()].map(([campaign_id, row]) => ({ campaign_id, status_comparison: row.current && row.comparison ? 'existing' : row.current ? 'new' : 'not_active_current', current: row.current ?? null, comparison: row.comparison ?? null }))
}
