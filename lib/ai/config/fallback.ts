import { z } from 'zod'
import type { AgentConfig, SupervisorConfig } from '../types'

/**
 * Temporary configuration used until the Supabase agent tables are confirmed.
 * Keep this isolated so it can be replaced by the repository without changing
 * Supervisor or UI code.
 */
export const FALLBACK_MODEL = 'openai/gpt-5.5'

export const FALLBACK_SUPERVISOR: SupervisorConfig = {
  id: 'fallback-supervisor',
  name: 'Supervisor Agent',
  systemPrompt:
    'Sos el Supervisor Agent de MDK Workspace. Interpretá la consulta del usuario y respondé con claridad. Para cualquier pregunta sobre gasto, impresiones, clics, conversiones, campañas o métricas, DEBÉS ejecutar get_google_metrics o get_meta_metrics antes de responder; nunca inventes ni asumas ARS $0. Si el usuario pide analizar performance, después de obtener las métricas DEBÉS ejecutar run_performance_analyst; no reconstruyas ni envíes snapshots como argumentos. Si una herramienta devuelve error o no devuelve filas, informá el error exacto y el rango consultado. Usá get_account_context primero si necesitás confirmar las cuentas activas.',
  model: FALLBACK_MODEL,
  isActive: true,
  delegateAgents: ['meta-ads', 'google-ads', 'performance-analyst'],
  enabledTools: ['get_account_context', 'get_google_metrics', 'get_meta_metrics', 'run_performance_analyst'],
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

export const FALLBACK_AGENTS: AgentConfig[] = [
  {
    id: 'fallback-meta-ads',
    name: 'Meta Ads Agent',
    slug: 'meta-ads',
    description: 'Preparado para consultar y analizar datos de Meta Ads.',
    systemPrompt: 'Analizá datos de Meta Ads cuando las herramientas estén habilitadas.',
    model: FALLBACK_MODEL,
    isActive: false,
    enabledTools: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
  {
    id: 'fallback-google-ads',
    name: 'Google Ads Agent',
    slug: 'google-ads',
    description: 'Preparado para consultar y analizar datos de Google Ads.',
    systemPrompt: 'Analizá datos de Google Ads cuando las herramientas estén habilitadas.',
    model: FALLBACK_MODEL,
    isActive: false,
    enabledTools: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
  {
    id: 'fallback-performance-analyst',
    name: 'Performance Analyst Agent',
    slug: 'performance-analyst',
    description: 'Preparado para cruzar métricas, históricos y benchmarks.',
    systemPrompt: 'Generá hallazgos y recomendaciones cuando las fuentes estén habilitadas.',
    model: FALLBACK_MODEL,
    isActive: false,
    enabledTools: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
]

export const FALLBACK_CONFIG_SOURCE = 'fallback'

export function getFallbackSupervisor(): SupervisorConfig {
  return { ...FALLBACK_SUPERVISOR }
}

export function getFallbackAgents(): AgentConfig[] {
  return FALLBACK_AGENTS.map((agent) => ({ ...agent, enabledTools: [...agent.enabledTools] }))
}

export function getFallbackAgent(slug: string): AgentConfig | undefined {
  return getFallbackAgents().find((agent) => agent.slug === slug)
}

export function isFallbackModel(model: string): boolean {
  return model === FALLBACK_MODEL
}

export const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(50),
  context: z
    .object({
      clientId: z.string().uuid().optional(),
      conversationId: z.string().uuid().optional(),
      accountId: z.string().max(200).optional(),
      metaAccountId: z.string().max(200).optional(),
      googleCustomerId: z.string().max(200).optional(),
    })
    .optional()
    .default({}),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

export function getFallbackStatus() {
  return {
    source: FALLBACK_CONFIG_SOURCE,
    supervisor: getFallbackSupervisor(),
    agents: getFallbackAgents(),
  }
}
