export type UserRole = 'direccion' | 'project_manager' | 'account_manager' | 'consultor'

export type ClientStatus = 'verde' | 'amarillo' | 'naranja' | 'rojo'

export type ClientPlan = 'Esencial' | 'Estrategico' | 'Premium'

export type Platform = 'all' | 'meta' | 'google'

export type DateRangePreset = 'last_30d' | 'last_14d' | 'last_7d' | 'daily' | 'monthly' | 'yearly' | 'custom'

export interface DateRange {
  preset: DateRangePreset
  start?: string
  end?: string
}

export interface DashboardFilters {
  platform: Platform
  clientIds: string[] // empty = all
  adAccountId: string | null // specific ad account to filter within a platform
  dateRange: DateRange
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: string // normalized role name (lowercase, underscores)
  role_name?: string // display name from roles table
  rol_id?: string // UUID reference to roles table
  departamento_id?: string | null
  departamento_name?: string | null
  modulos_habilitados?: string[] // enabled modules for this user
  avatar_url: string | null
  theme: 'light' | 'dark' | 'system' | null
  accent_hue: number | null
  onboarding_completed: boolean | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  business_name: string
  contact_name: string | null
  contact_lastname: string | null
  phone: string | null
  status: ClientStatus | null
  semaforo_id: string | null
  notion_id: string | null
  fee_mdk: number | null
  fee_aurelia: number | null
  google_ads_customer_id: string | null
  meta_ads_account_id: string | null
  crm_type: string | null
  ghl_location_id: string | null
  ghl_token: string | null
  plan: ClientPlan
  project_manager_id: string | null
  account_manager_id: string | null
  created_at: string
  updated_at: string
}

export interface UserClientAccess {
  id: string
  user_id: string
  client_id: string
  access_level: 'read' | 'write' | 'admin'
  created_at: string
}

export interface AdCampaign {
  id: string
  client_id: string
  platform: 'meta' | 'google'
  external_campaign_id: string
  name: string
  status: string | null
  objective: string | null
  budget: number | null
  created_at: string
  updated_at: string
}

export interface AdInsight {
  id: string
  campaign_id: string
  date: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  revenue: number
  cpc: number | null
  ctr: number | null
  roas: number | null
  created_at: string
}

export interface Report {
  id: string
  client_id: string
  created_by: string
  title: string
  content: Record<string, unknown> | null
  type: 'weekly' | 'monthly' | 'scorecard' | 'analysis'
  status: 'draft' | 'published' | 'archived'
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  user_id: string
  client_id: string | null
  action: string
  description: string | null
  created_at: string
}

// API Response Types
export interface MetaAdsInsight {
  campaign_id: string
  campaign_name: string
  campaign_type: string
  status: string
  objective: string
  impressions: string
  clicks: string
  spend: string
  leads: string
  cpl: string
  ctr: string
  date_start: string
  date_stop: string
}

export interface GoogleAdsMetric {
  campaign_id: string
  campaign_name: string
  campaign_type: string
  status: string
  impressions: string
  clicks: string
  cost_micros: string
  conversions: string
  date: string
}

// Dashboard KPIs - updated
export interface DashboardKPIs {
  totalInvestment: number
  leads: number
  cpl: number
  investmentChange: number
  leadsChange: number
  cplChange: number
}

// Campaign type distribution
export interface CampaignTypeData {
  type: string
  label: string
  spend: number
  leads: number
  percentage: number
  color: string
}

// Investment trend
export interface InvestmentTrendPoint {
  date: string
  spend: number
  leads: number
}

// Scorecard row
export interface ScorecardRow {
  clientId: string
  clientName: string
  accountName?: string
  accountId?: string
  campaignId?: string
  campaignName?: string
  platform: 'meta' | 'google'
  budget: number | null
  daysToEnd: number | null
  leads: number
  leadType: string
  cpl: number
  ctr: number
  impressions: number
  clicks: number
  spend: number
  crmContacts: number   // contacts from CRM (GHL / Aurelia) in date range
}

// Scorecard column config
export interface ScorecardColumn {
  key: keyof ScorecardRow | string
  label: string
  visible: boolean
  format: 'currency' | 'number' | 'percent' | 'text' | 'days'
}

// Chat Message
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// ── Budget Alerts ─────────────────────────────────────────────────────────────

export type BudgetAlertStatus = 'normal' | 'attention' | 'critical' | 'subdelivery'

export interface BudgetCampaignAlert {
  id: string
  name: string
  type: string | null
  investment: number
  budget: number
  consumed_percent: number
  status: BudgetAlertStatus
  trend: 'normal' | 'fast' | 'very_fast' | 'slow' | 'very_slow'
  message: string
}

export interface BudgetPlatformSummary {
  connected: boolean
  account_status: string
  currency: string
  investment: number
  budget: number
  consumed_percent: number
  status: BudgetAlertStatus
  projection_text: string
  last_sync: string | null
  campaigns: BudgetCampaignAlert[]
}

export interface ClientBudgetAlert {
  clientId: string
  clientName: string
  google_ads: BudgetPlatformSummary | null
  meta_ads: BudgetPlatformSummary | null
}

// ── Task Management ───────────────────────────────────────────────────────────

export interface Cliente {
  id: string
  nombre_del_negocio: string
  nombre_contacto?: string | null
  apellido_contacto?: string | null
  telefono?: string | null
  estado?: string | null
  created_at?: string
  updated_at?: string
}

export interface TipoDeTarea {
  id: string
  nombre: string
  departamento_id?: string | null
  activo: boolean
  created_at?: string
}

export interface Colaborador {
  id: string
  nombre: string
  email?: string | null
  departamento_id?: string | null
  rol?: string | null
  activo?: boolean
}

export type TaskStatus = 'pendiente' | 'resolviendo' | 'demorada' | 'pausada' | 'pendiente_aprobacion' | 'resuelto'
export type TaskPriority = 'alta' | 'media' | 'baja'
// TaskType is now dynamic - it's the UUID of tipo_de_tareas
export type TaskType = string

export interface TaskCustomField {
  label: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect'
  value: string // For boolean: 'true' | 'false', for multiselect: comma-separated values
  options?: string[] // For select and multiselect types
}

export interface TaskTimeSession {
  id: string
  startedAt: Date
  endedAt: Date | null
  durationSec: number
}

export interface TaskActivity {
  id: string
  action: string
  timestamp: Date
  userId: string
  userName: string
}

export interface TaskComment {
  id: string
  content: string
  userId: string
  userName: string
  userAvatar: string | null
  createdAt: Date
}

export interface TaskFile {
  id: string
  name: string
  url: string
  mimeType: string
  size: number
  uploadedBy: string
  uploadedByName: string
  createdAt: Date
}

export interface TaskQuotation {
  hours: number
  hourlyRate: number // Default $150,000
  subtotal: number
  iva: number // 21%
  total: number
  notes: string
}

export interface Task {
  id: string
  title: string
  description: string | null // Rich text HTML content
  clientId: string
  clientName: string
  assigneeId: string
  assigneeName: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType // UUID from tipo_de_tareas or legacy string
  typeName?: string // Display name from tipo_de_tareas
  dueDate: Date | null
  isActive: boolean // Toggle to resume task independently of status
  customFields: Record<string, TaskCustomField>
  timeSessions: TaskTimeSession[]
  totalTimeSec: number
  isTimerRunning: boolean
  timerStartedAt: Date | null
  activities: TaskActivity[]
  comments: TaskComment[]
  files: TaskFile[]
  quotation: TaskQuotation | null
  createdAt: Date
  updatedAt: Date
}
