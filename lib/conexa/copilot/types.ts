export const RECOMMENDATION_STATUSES = ['draft', 'published', 'discarded'] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

export const RECOMMENDATION_PLATFORMS = ['meta', 'google_ads', 'ga4', 'tag_manager', 'crm'] as const
export type RecommendationPlatform = (typeof RECOMMENDATION_PLATFORMS)[number]
export type RecommendationPriority = 'alta' | 'media' | 'baja'
export type RecommendationType = 'presupuesto' | 'creatividades' | 'segmentacion' | 'estructura' | 'tracking' | 'crm' | 'otro'
export type ContextSource = 'chat' | 'manual'
export type ChatRole = 'user' | 'assistant'

export type RecommendationEvidence = { id: string; label: string; excerpt: string }
export type Recommendation = {
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

export type RecommendationDraft = Pick<Recommendation, 'title' | 'platforms' | 'type' | 'priority' | 'description' | 'rationale' | 'suggested_actions' | 'expected_impact' | 'evidence'>

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
