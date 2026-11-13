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
  | { platform: 'google_ads'; kind: 'set_status'; customerId: string; campaignId: string; entityName: string; status: 'ENABLED' | 'PAUSED' }
  | { platform: 'google_ads'; kind: 'set_daily_budget'; customerId: string; campaignId: string; entityName: string; dailyBudget: number }

export type ExecutionResult = { platform: 'meta' | 'google_ads'; entityId: string; entityName: string; before: string; after: string; executedAt: string }

export const META_LEVEL_LABEL = { campaign: 'Campaña', adset: 'Conjunto de anuncios', ad: 'Anuncio' } as const

export function describeOperation(operation: RecommendationOperation) {
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

export type RecommendationDraft = Pick<Recommendation, 'title' | 'platforms' | 'type' | 'priority' | 'description' | 'rationale' | 'suggested_actions' | 'expected_impact' | 'evidence'> & { operation?: RecommendationOperation | null }

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
