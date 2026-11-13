export const RECOMMENDATION_STATUSES = ['draft', 'executing', 'published', 'discarded'] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

export const RECOMMENDATION_PLATFORMS = ['meta', 'google_ads', 'ga4', 'tag_manager', 'crm'] as const
export type RecommendationPlatform = (typeof RECOMMENDATION_PLATFORMS)[number]
export type RecommendationPriority = 'alta' | 'media' | 'baja'
export type RecommendationType = 'presupuesto' | 'creatividades' | 'segmentacion' | 'estructura' | 'tracking' | 'crm' | 'otro'
export type ContextSource = 'chat' | 'manual'
export type ChatRole = 'user' | 'assistant'

export type RecommendationEvidence = { id: string; label: string; excerpt: string }

export type RecommendationOperation =
  | { platform: 'meta'; kind: 'set_status'; level: 'campaign' | 'adset' | 'ad'; entityId: string; entityName: string; status: 'ACTIVE' | 'PAUSED' }
  | { platform: 'meta'; kind: 'set_daily_budget'; level: 'campaign' | 'adset'; entityId: string; entityName: string; dailyBudget: number }
  | { platform: 'meta'; kind: 'set_age_range'; adsets: Array<{ id: string; name: string }>; ageMin: number; ageMax: number }
  | { platform: 'meta'; kind: 'create_campaign'; templateAdsetId: string; templateAdsetName: string; campaignName: string; adsetName: string; dailyBudget: number; ageMin: number | null; ageMax: number | null; ads: Array<{ id: string; name: string }> }
  | { platform: 'google_ads'; kind: 'set_status'; customerId: string; campaignId: string; entityName: string; status: 'ENABLED' | 'PAUSED' }
  | { platform: 'google_ads'; kind: 'set_daily_budget'; customerId: string; campaignId: string; entityName: string; dailyBudget: number }

export type PlanStep = {
  platform: 'meta' | 'google_ads'
  accountId: string
  entityType: 'campaign' | 'adset' | 'ad'
  entityId: string
  entityName: string
  field: 'status' | 'daily_budget' | 'age_range' | 'create'
  before: string | number
  after: string | number
  beforeLabel: string
  afterLabel: string
  pctChange: number | null
  warnings: string[]
  alreadyApplied: boolean
}
export type ExecutionPlan = { steps: PlanStep[]; hash: string }
export type CreatedEntities = { campaignId: string; adsetId: string; adIds: string[] }
export type PlanStepResult = PlanStep & { outcome: 'success' | 'failed' | 'skipped'; error?: string; created?: CreatedEntities }

type LegacyExecutionResult = { platform: 'meta' | 'google_ads'; entityId: string; entityName: string; before: string; after: string; executedAt: string }
export type ExecutionResult =
  | LegacyExecutionResult
  | { manual: true; executedAt: string }
  | { steps: PlanStepResult[]; planHash: string; executedAt: string }

export type DecisionRecord = {
  id: string
  recommendation_id?: string | null
  user_id: string | null
  user_name?: string | null
  action: 'publish' | 'discard' | 'revert' | 'manual_done'
  platform: 'meta' | 'google_ads' | null
  entity_type: string | null
  entity_id: string | null
  value_before: { value?: unknown; label?: string } | null
  value_after: { value?: unknown; label?: string } | null
  outcome: 'success' | 'failed' | null
  created_at: string
  payload: { step?: Partial<PlanStepResult>; [key: string]: unknown } | null
}

export type RecommendationSource = 'chat' | 'scan' | 'manual'

/** Líneas legibles del resultado, compatibles con filas anteriores a la migración. */
export function executionLines(result: ExecutionResult | null) {
  if (!result) return []
  if ('manual' in result) return ['Marcada como hecha manualmente']
  if ('steps' in result) return result.steps.map((item) => `${item.entityName}: ${item.beforeLabel} → ${item.afterLabel}${item.outcome === 'failed' ? ' (falló)' : item.outcome === 'skipped' ? ' (ya aplicado)' : ''}`)
  return [`${result.entityName}: ${result.before} → ${result.after}`]
}

export const META_LEVEL_LABEL = { campaign: 'Campaña', adset: 'Conjunto de anuncios', ad: 'Anuncio' } as const

export function describeOperation(operation: RecommendationOperation) {
  if (operation.kind === 'create_campaign') {
    const age = operation.ageMin !== null && operation.ageMax !== null ? `, edad ${operation.ageMin} a ${operation.ageMax === 65 ? '65+' : operation.ageMax}` : ''
    return `Crear en pausa la campaña «${operation.campaignName}» (modelo: conjunto «${operation.templateAdsetName}»), presupuesto diario ${operation.dailyBudget.toLocaleString('es-AR')}${age}, ${operation.ads.length} anuncio(s)`
  }
  if (operation.kind === 'set_age_range') {
    const names = operation.adsets.map((adset) => `«${adset.name}»`).join(', ')
    return `${operation.adsets.length === 1 ? 'Conjunto' : `${operation.adsets.length} conjuntos`} ${names}: edad ${operation.ageMin} a ${operation.ageMax === 65 ? '65+' : operation.ageMax}`
  }
  const target = operation.platform === 'meta' ? `${META_LEVEL_LABEL[operation.level]} «${operation.entityName}»` : `Campaña «${operation.entityName}»`
  if (operation.kind === 'set_status') return `${target}: ${operation.status === 'PAUSED' ? 'pausar' : 'activar'}`
  return `${target}: presupuesto diario a ${operation.dailyBudget.toLocaleString('es-AR')}`
}

export type Recommendation = {
  operation: RecommendationOperation | null
  execution_result: ExecutionResult | null
  execution_error: string | null
  non_executable_reason: string | null
  source?: RecommendationSource | null
  run_id?: string | null
  dedupe_key?: string | null
  executing_at?: string | null
  decisions?: DecisionRecord[]
  id: string
  client_id: string
  title: string
  platforms: RecommendationPlatform[]
  type: RecommendationType
  priority: RecommendationPriority
  description: string
  rationale: string
  suggested_actions: string[]
  expected_impact: string
  evidence: RecommendationEvidence[]
  status: RecommendationStatus
  discard_reason: string | null
  created_by: string
  published_by: string | null
  published_by_name?: string | null
  published_at: string | null
  discarded_by: string | null
  discarded_by_name?: string | null
  discarded_at: string | null
  created_at: string
  updated_at: string
}

export type RecommendationDraft = Pick<Recommendation, 'title' | 'platforms' | 'type' | 'priority' | 'description' | 'rationale' | 'suggested_actions' | 'expected_impact' | 'evidence'> & { operation?: RecommendationOperation | null; non_executable_reason?: string | null; dedupe_key?: string | null }

export type ClientContextRecord = {
  id: string
  client_id: string
  content: string
  source: ContextSource
  created_by: string
  created_at: string
}

export type CopilotChatMessage = {
  id: string
  client_id: string
  user_id: string
  role: ChatRole
  content: string
  created_at: string
}

export type CopilotContext = {
  clientName: string
  profile: Record<string, unknown> | null
  tasks: Array<Record<string, unknown>>
  comments: Array<Record<string, unknown>>
  notes: ClientContextRecord[]
  platforms: RecommendationPlatform[]
}

export const PLATFORM_LABEL: Record<RecommendationPlatform, string> = {
  meta: 'Meta Ads',
  google_ads: 'Google Ads',
  ga4: 'Google Analytics',
  tag_manager: 'Tag Manager',
  crm: 'CRM',
}

export const RECOMMENDATION_TYPE_LABEL: Record<RecommendationType, string> = {
  presupuesto: 'Presupuesto',
  creatividades: 'Creatividades',
  segmentacion: 'Segmentación',
  estructura: 'Estructura de campañas',
  tracking: 'Tracking / medición',
  crm: 'CRM / seguimiento',
  otro: 'Otro',
}
