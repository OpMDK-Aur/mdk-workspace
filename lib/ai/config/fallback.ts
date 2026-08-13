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
    'Sos el Supervisor Agent de MDK Workspace. Interpretá la consulta del usuario, respondé con claridad y no inventes datos de cuentas, campañas o métricas que no fueron proporcionados. En esta primera etapa no delegues a otros agentes.',
  model: FALLBACK_MODEL,
  isActive: true,
  delegateAgents: ['meta-ads', 'google-ads', 'performance-analyst'],
  enabledTools: [],
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
  query: z.string().trim().min(1).max(4000),
  context: z
    .object({
      clientId: z.string().uuid().optional(),
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
