export type SourceKind = 'Performance' | 'Competencia' | 'Historial' | 'Objetivo' | 'Contexto'
export type Source = { k: SourceKind; t: string; f: string }

/** Agrupa acciones relacionadas en una misma jugada. */
export type Play = { id: string; kind: string; move: string; impact: string }

export type CopilotPlatform = 'meta' | 'google-ads' | 'crm' | 'tracking'
export type Priority = 'alta' | 'media' | 'baja'
export type RecommendationStatus = 'pending' | 'executing' | 'executed' | 'scheduled' | 'rejected'

export type Recommendation = {
  id: string
  clientId: string
  playId?: string
  type: string
  platform: CopilotPlatform
  priority: Priority
  entity: string
  title: string
  summary: string
  why: string
  sources: Source[]
  before: string
  after: string
  diff: string
  impact: string
  how: string
  status: RecommendationStatus
  version: number
  edited?: boolean
  revisionNote?: string
  slot?: string
  rejectReason?: string
}

export type DecisionKind = 'Aprobada' | 'Editada y aprobada' | 'Rechazada' | 'Revertida'
export type ResultState = 'measuring' | 'ok' | 'bad' | 'scheduled' | 'none'

export type Decision = {
  id: string
  recId: string
  date: string
  by: string
  decision: DecisionKind
  recommended: string
  executed?: string
  before?: string
  after?: string
  revertible: boolean
  result: { state: ResultState; metric?: string; day?: number }
  title?: string
  platform?: CopilotPlatform
  type?: string
}

export type Learning = { id: string; text: string; isNew?: boolean; date: string }

export type CopilotContext = { objective: string; decisionsCount: number; sources: string[] }

export type RecommendationsResponse = { recommendations: Recommendation[]; plays: Play[]; context: CopilotContext }
export type LearningsResponse = { decisions: Decision[]; learnings: Learning[] }

export type DashboardRange = '7' | '30' | '90'
export type DashboardFilters = { type?: string; platform?: CopilotPlatform | ''; range: DashboardRange; by?: string }
export type DashboardResponse = {
  kpis: { executed: number; successRate: number; rejected: number; measuring: number }
  byPlatform: { key: CopilotPlatform; count: number }[]
  byType: { key: string; count: number }[]
  rows: Decision[]
  options: { types: string[]; people: string[] }
}

export const PLATFORM_LABEL: Record<CopilotPlatform, string> = {
  meta: 'Meta Ads',
  'google-ads': 'Google Ads',
  crm: 'CRM',
  tracking: 'Tracking',
}

export const REJECT_REASONS = [
  'No aplica en este momento',
  'El cliente no lo aprobaría',
  'Los datos no son correctos',
  'Ya lo hicimos a mano',
] as const

const WHY_ORDER: SourceKind[] = ['Performance', 'Competencia', 'Historial']

/**
 * La línea de motivo nunca es el objetivo general del cliente: se usa el `why` propio,
 * después las fuentes por prioridad y, como último recurso, el resumen.
 */
export function resolveWhy(rec: Pick<Recommendation, 'why' | 'sources' | 'summary'>) {
  if (rec.why?.trim()) return rec.why
  for (const kind of WHY_ORDER) {
    const match = rec.sources.find((source) => source.k === kind)
    if (match) return match.t
  }
  return rec.sources.find((source) => source.k !== 'Objetivo')?.t ?? rec.summary
}
