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
  entidad: EntitySchema,
  version_config: z.object({
    schema_version: z.literal('1'),
    agent_config_version: z.string(),
  }),
  suficiencia: SufficiencySchema,
  faltantes: z.array(MissingRequirementSchema),
  confianza: ConfidenceSchema,
  hallazgos: z.array(FindingSchema),
  recomendaciones: z.array(RecommendationSchema),
  caveats: z.array(CaveatSchema),
})

export type SpecialistOutput = z.infer<typeof SpecialistOutputSchema>

export const PaidMediaSnapshotSchema = z.object({
  client_id: z.string(),
  platform: z.enum(['google', 'meta']),
  account_id: z.string(),
  account_name: z.string().nullable(),
  currency: z.string().nullable(),
  period: z.object({ from: z.string(), to: z.string() }),
  metrics: z.record(z.string(), z.unknown()),
  campaigns: z.array(z.record(z.string(), z.unknown())),
})

export type PaidMediaSnapshot = z.infer<typeof PaidMediaSnapshotSchema>

export type AnalysisRunState = {
  paidMediaSnapshots: PaidMediaSnapshot[]
}

export function upsertPaidMediaSnapshot(state: AnalysisRunState, snapshot: PaidMediaSnapshot) {
  const index = state.paidMediaSnapshots.findIndex((current) =>
    current.platform === snapshot.platform &&
    current.account_id === snapshot.account_id &&
    current.period.from === snapshot.period.from &&
    current.period.to === snapshot.period.to,
  )
  if (index === -1) state.paidMediaSnapshots.push(snapshot)
  else state.paidMediaSnapshots[index] = snapshot
}
