import { z } from 'zod'
import type { ExecutionContext, ToolDefinition } from '../types'

const noInput = z.object({})

const getAccountContext: ToolDefinition = {
  key: 'get_account_context',
  description: 'Obtiene el contexto de la cuenta activa cuando el backend lo implemente.',
  inputSchema: noInput,
  async execute(_input, context: ExecutionContext) {
    return {
      available: false,
      accountId: context.accountId ?? null,
      message: 'La consulta de cuenta quedará habilitada cuando se confirme el repositorio de Supabase.',
    }
  },
}

const getMetaMetrics: ToolDefinition = {
  key: 'get_meta_metrics',
  description: 'Consulta métricas de Meta Ads con contexto de cuenta server-side.',
  inputSchema: z.object({ period: z.string().max(80).optional() }),
  async execute(input: { period?: string }, context: ExecutionContext) {
    return {
      available: false,
      period: input.period ?? 'últimos 30 días',
      metaAccountId: context.metaAccountId ?? null,
      message: 'La integración de métricas de Meta Ads está reservada para la siguiente etapa.',
    }
  },
}

const getGoogleMetrics: ToolDefinition = {
  key: 'get_google_metrics',
  description: 'Consulta métricas de Google Ads con contexto de cuenta server-side.',
  inputSchema: z.object({ period: z.string().max(80).optional() }),
  async execute(input: { period?: string }, context: ExecutionContext) {
    return {
      available: false,
      period: input.period ?? 'últimos 30 días',
      googleCustomerId: context.googleCustomerId ?? null,
      message: 'La integración de métricas de Google Ads está reservada para la siguiente etapa.',
    }
  },
}

const getPreviousInsights: ToolDefinition = {
  key: 'get_previous_insights',
  description: 'Busca hallazgos previos de una cuenta.',
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
  async execute(input: { limit: number }, context: ExecutionContext) {
    return {
      available: false,
      limit: input.limit,
      accountId: context.accountId ?? null,
      message: 'La memoria de insights se habilitará cuando se confirme el esquema de Supabase.',
    }
  },
}

const allTools: ToolDefinition[] = [
  getAccountContext,
  getMetaMetrics,
  getGoogleMetrics,
  getPreviousInsights,
]

export function getToolDefinitions(enabledKeys: string[]): ToolDefinition[] {
  return allTools.filter((definition) => enabledKeys.includes(definition.key))
}

export function getToolCatalog() {
  return allTools.map(({ key, description }) => ({ key, description }))
}
