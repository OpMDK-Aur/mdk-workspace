export type UserRole = 'Master' | 'Usuario' | 'Lector'

export type Puesto =
  | 'Administrador/a' | 'Director/a' | 'CEO'
  | 'Project Manager' | 'Account Manager'
  | 'Desarrollador' | 'Diseñador/a' | 'Analista' | 'Coordinador'
  | 'Especialista' | 'Administrador'

export type SemaforoStatus = 'verde' | 'amarillo' | 'naranja' | 'rojo'

export type ClientPlan = 'Esencial' | 'Estrategico'

export type UnidadNegocio = 'MDK' | 'Aurelia' | 'Consultoría' | 'Tecnología'

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
  puesto?: string | null
  created_at: string
  updated_at: string
}

export type ClientEtapa = 'activacion' | '1_3_meses' | '4_6_meses' | '7_mas' | 'solicito_baja' | 'inhabilitado_mora'

// Opciones predefinidas para el estado de mora de un cliente.
// Un valor vacío/null indica que el cliente no está en mora.
export const MORA_OPTIONS = [
  { value: 'sin_mora', label: 'Sin mora' },
  { value: '1 mes de mora', label: '1 mes de mora' },
  { value: '2 meses de mora', label: '2 meses de mora' },
  { value: '3 meses de mora', label: '3 meses de mora' },
  { value: '3+ meses de mora', label: '3+ meses de mora' },
] as const

export type MoraStatus = (typeof MORA_OPTIONS)[number]['value']

export interface ServicioContratado {
  id: string
  nombre: string
  categoria?: string
  icono?: string
  color?: string
}

export interface SemaforoUnidad {
  unidad_id: string
  unidad_nombre: string
  semaforo: SemaforoStatus
}

export interface Client {
  id: string
  nombre_del_negocio: string
  // Alias for compatibility
  business_name?: string
  // Contact fields - DB uses nombre/apellido/telefono
  nombre?: string | null
  apellido?: string | null
  telefono?: string | null
  // Legacy aliases
  contact_name?: string | null
  contact_lastname?: string | null
  phone?: string | null
  email?: string | null
  /** @deprecated Use semaforo_unidades instead */
  status?: SemaforoStatus | null
  semaforo_id: string | null
  notion_id: string | null
  fee_mdk: number | null
  fee_aurelia: number | null
  fee_consultoria?: number | null
  mora?: string | null
  nps_score?: number | null
  google_ads_customer_id: string | null
  meta_ads_account_id: string | null
  google_ads_customer_ids?: string[] | null
  meta_ads_account_ids?: string[] | null
  crm_type: string | null
  crm_tipo?: string | null
  crm_url?: string | null
  crm_location_id?: string | null
  ghl_location_id: string | null
  ghl_token: string | null
  discord_channel_name: string | null
  discord_channel_id: string | null
  plan?: ClientPlan | null
  project_manager_id: string | null
  account_manager_id: string | null
  project_manager_ids?: string[] | null
  account_manager_ids?: string[] | null
  landings?: Array<{ nombre: string; url: string; tipo: string }> | null
  // Nuevos campos
  servicio_id?: string[] | null // Array de UUIDs de servicios
  servicios_contratados?: ServicioContratado[] | null // Legacy
  contacto_nombre?: string | null
  contacto_email?: string | null
  contacto_telefono?: string | null
  contacto_cargo?: string | null
  fecha_venta?: string | null
  fecha_activacion?: string | null
  fecha_inicio_trabajo?: string | null
  fecha_baja?: string | null
  etapa?: ClientEtapa | null
  semaforo_unidades?: Record<string, SemaforoStatus> | null
  unidades_negocio?: UnidadNegocio[] | null
  /** @deprecated Use unidades_negocio instead */
  unidad_negocio?: UnidadNegocio | null
  /** Estado del cliente: true=activo (default), false=inactivo */
  activo?: boolean | null
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

// ─��� Service Map (Mapa de Servicio) ────────────────────────────────────────────

export type TipoServicio = 'esencial' | 'estrategico'

export type FrecuenciaHito = 'Mensual' | 'Bimestral' | 'Semanal' | 'Semanal (Lun)' | 'Semanal (Vie)' | '2 Veces x Sem'

export type EstadoInstancia = 'pendiente' | 'en_curso' | 'listo' | 'no_aplica' | 'no_realizado'

export type TipoMinuta = 'reunion_cierre_mes' | 'reunion_scorecard' | 'reunion_alineacion' | 'otra'

export interface ChecklistItem {
  id: string
  texto: string
}

export interface ChecklistItemSnapshot {
  id: string
  texto: string
  completado: boolean
}

export interface HitoCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
  tipo_servicio: TipoServicio
  frecuencia: FrecuenciaHito
  genera_tarea: boolean
  requiere_link_drive: boolean
  checklist_esencial: ChecklistItem[] | null
  checklist_estrategico: ChecklistItem[] | null
}

export interface MapaServicioInstancia {
  id: string
  cliente_id: string
  hito_id: string
  mes: number
  anio: number
  semana_del_mes: number | null
  estado: EstadoInstancia
  completado_por: string | null
  fecha_completado: string | null // DATE as string
  link_drive: string | null
  tarea_id: string | null
  checklist_snapshot: ChecklistItemSnapshot[] | null
  checklist_completo: boolean | null
  tipo_servicio_cliente: TipoServicio | null
  // Joined fields
  hito?: HitoCatalogo
}

export interface MinutaCliente {
  id: string
  cliente_id: string
  titulo: string
  contenido: string | null
  fecha: string // DATE as string
  tipo: TipoMinuta
  autor: string | null
  colaborador_id: string | null
  creado_en: string
  actualizado_en: string
}

export interface ServiceMapKPIs {
  clientId: string
  clientName: string
  plan: ClientPlan
  totalHitos: number
  completados: number
  noRealizados: number
  progresoPercent: number
  checklistsCompletos: number
  checklistCompletoPercent: number
  ultimoHito: string | null
  ultimaFecha: string | null
  projectManagerId: string | null
  accountManagerId: string | null
}

// ── Task Management ───────────────────────────────────────────────────────────

export interface Cliente {
  id: string
  nombre_del_negocio: string
  nombre_contacto?: string | null
  apellido_contacto?: string | null
  telefono?: string | null
  estado?: string | null
  /** Estado del cliente: true=activo (default), false=inactivo */
  activo?: boolean | null
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

export type TaskStatus = 'pendiente' | 'resolviendo' | 'demorada' | 'pausada' | 'pendiente_aprobacion' | 'resuelto' | 'no_realizado'
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
  attachments?: { url: string; name: string; mimeType: string }[]
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

export interface TaskAssignee {
  id: string
  nombre: string
  avatar_url: string | null
  }

export interface TaskClient {
  id: string
  nombre_del_negocio: string
  }
  
export interface Task {
  id: string
  title: string
  description: string | null // Rich text HTML content
  // Legacy single client (for backwards compatibility)
  clientId: string
  clientName: string
  // Multi-client support
  clientIds: string[]
  clients: TaskClient[]
  // Legacy single assignee (for backwards compatibility)
  assigneeId: string
  assigneeName: string
  assigneeAvatar?: string | null
  // Multi-assignee support
  assignees: TaskAssignee[]
  status: TaskStatus
  priority: TaskPriority
  type: TaskType // UUID from tipo_de_tareas or legacy string
  typeName?: string // Display name from tipo_de_tareas
  dueDate: Date | null
  isActive: boolean // Toggle to resume task independently of status
  isSystemTask?: boolean // System/recurring task with special styling
  systemTaskMeta?: {
    recurrence: 'daily' | 'weekly' | 'monthly'
    whatsappLink?: string // Pre-built WhatsApp link for client
  }
  customFields: Record<string, TaskCustomField>
  timeSessions: TaskTimeSession[]
  totalTimeSec: number
  isTimerRunning: boolean
  timerStartedAt: Date | null
  activities: TaskActivity[]
  comments: TaskComment[]
  files: TaskFile[]
  quotation: TaskQuotation | null
  // Service Map integration
  hitoPoe: string | null // UUID reference to hitos_catalogo
  createdById: string | null
  createdByName: string
  createdByAvatar?: string | null
  createdAt: Date
  updatedAt: Date
}

// ── Agentes IA ────────────────────────────────────────────────────────────────

export interface AgentConfig {
  id: string
  slug: string
  nombre: string
  descripcion: string | null
  icono: string | null
  trigger_type: 'manual' | 'cron_diario' | 'cron_semanal'
  system_prompt: string | null
  parametros: Record<string, unknown>
  comportamiento: Record<string, unknown>
  activo: boolean
  actualizado_por: string | null
  updated_at: string
}

export interface AgentLog {
  id: string
  agente: string
  ejecutado_en: string
  ejecutado_por: string | null
  cliente_id: string | null
  clientes_auditados: number
  alertas_generadas: number
  resultado: Record<string, unknown> | null
  estado: 'ok' | 'error' | 'parcial'
  created_at: string
}
