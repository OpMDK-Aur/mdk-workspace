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
    'Sos el Supervisor Agent de MDK Workspace. Interpretá la consulta y respondé con claridad. Para cualquier pregunta de métricas ejecutá get_google_metrics o get_meta_metrics antes de responder; nunca inventes datos. Para estrategia, recomendaciones o interpretación de negocio ejecutá get_client_memory. Si faltan industry, commercial_objective o product_type, preguntá únicamente esos campos faltantes. Cuando el usuario proporcione o confirme explícitamente un dato, ejecutá save_client_profile; nunca persistas inferencias propias. Para performance ejecutá run_performance_analyst después de obtener métricas. Si preguntan por benchmarks, comportamiento de otros clientes o comparación por industria, ejecutá get_industry_benchmark antes de responder; si devuelve available=false explicá el motivo sin afirmar datos de peers. Para historial ejecutá get_account_change_history: platform=google para Google, platform=meta para Meta y sin platform para ambas. Si también piden impacto o causalidad, usá métricas, comparación si aplica, historial y luego run_performance_analyst. No presentes correlaciones como causas confirmadas. Si una herramienta devuelve error o no devuelve filas, informá la ausencia y el rango consultado; no digas que la tool no existe.',
  model: FALLBACK_MODEL,
  isActive: true,
  delegateAgents: ['meta-ads', 'google-ads', 'performance-analyst'],
  enabledTools: ['get_account_context', 'get_client_memory', 'save_client_profile', 'get_google_metrics', 'get_account_change_history', 'get_meta_metrics', 'get_industry_benchmark', 'run_performance_analyst'],
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
      // .catch(undefined): si el cliente manda un scoreConfig incompleto o
      // corrupto (p. ej. porque /api/ai/score-config falló), lo descartamos
      // en vez de invalidar toda la request. El Supervisor cae a sus
      // descripciones por defecto.
      scoreConfig: z
        .object({ objective: z.string().trim().min(10).max(4000) })
        .optional()
        .catch(undefined),
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
