import { createClient } from '@/lib/supabase/server'
import {
  getFallbackAgents,
  getFallbackSupervisor,
  FALLBACK_CONFIG_SOURCE,
} from '../config/fallback'
import type { AgentConfig, SupervisorConfig } from '../types'

export interface AgentConfigRepository {
  getSupervisor(userId: string): Promise<SupervisorConfig>
  getAgent(slug: string, userId: string): Promise<AgentConfig | undefined>
  listAgents(userId: string): Promise<AgentConfig[]>
  getSource(): string
}

type AgentRow = {
  id: string
  name: string
  slug: string
  description: string | null
  system_prompt: string
  model: string
  is_active: boolean
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type AgentToolRow = {
  tool_key: string
  is_enabled: boolean
}

const SUPABASE_CONFIG_SOURCE = 'supabase'

function toAgentConfig(row: AgentRow, tools: AgentToolRow[]): AgentConfig {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    systemPrompt: row.system_prompt,
    model: row.model,
    isActive: row.is_active,
    enabledTools: tools.filter((tool) => tool.is_enabled).map((tool) => tool.tool_key),
    settings: row.settings ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function toSupervisorConfig(
  agent: AgentConfig,
  metadata: Pick<SupervisorConfig, 'configSource' | 'fallbackUsed' | 'fallbackReason'> = {},
): SupervisorConfig {
  return {
    id: agent.id,
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    isActive: agent.isActive,
    delegateAgents: ['meta-ads', 'google-ads', 'performance-analyst'],
    // Las métricas deben estar disponibles aunque la configuración creada en
    // Supabase todavía no tenga filas en ai_agent_tools.
    enabledTools: Array.from(new Set([
      ...agent.enabledTools,
      'get_account_context',
      'get_google_metrics',
      'get_google_change_history',
      'get_meta_metrics',
    ])),
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    ...metadata,
  }
}

export class SupabaseAgentConfigRepository implements AgentConfigRepository {
  private source = SUPABASE_CONFIG_SOURCE

  getSource() {
    return this.source
  }

  private async loadAgent(slug: string): Promise<AgentConfig | undefined> {
    const supabase = await createClient()
    const { data: row, error } = await supabase
      .from('ai_agents')
      .select('id, name, slug, description, system_prompt, model, is_active, settings, created_at, updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    if (!row) return undefined

    const { data: tools, error: toolsError } = await supabase
      .from('ai_agent_tools')
      .select('tool_key, is_enabled')
      .eq('agent_id', row.id)

    if (toolsError) throw toolsError
    return toAgentConfig(row as AgentRow, (tools ?? []) as AgentToolRow[])
  }

  async getSupervisor(userId: string): Promise<SupervisorConfig> {
    try {
      const agent = await this.loadAgent('supervisor')
      if (!agent) throw new Error('Active Supabase supervisor configuration was not found')
      console.log('[v0] Agent config loaded', {
        source: SUPABASE_CONFIG_SOURCE,
        agent_slug: agent.slug,
        agent_id: agent.id,
        model: agent.model,
        updated_at: agent.updatedAt.toISOString(),
        enabled_tools_count: agent.enabledTools.length,
        fallback_used: false,
      })
      return toSupervisorConfig(agent, { configSource: 'supabase', fallbackUsed: false })
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : 'Unknown Supabase error'
      const fallback = getFallbackSupervisor()
      console.warn('[v0] Agent config fallback used', {
        source: FALLBACK_CONFIG_SOURCE,
        userId,
        agent_slug: 'supervisor',
        agent_id: fallback.id,
        model: fallback.model,
        updated_at: fallback.updatedAt.toISOString(),
        enabled_tools_count: fallback.enabledTools.length,
        fallback_used: true,
        fallback_reason: fallbackReason,
      })
      this.source = FALLBACK_CONFIG_SOURCE
      return {
        ...fallback,
        configSource: 'fallback',
        fallbackUsed: true,
        fallbackReason,
      }
    }
  }

  async getAgent(slug: string, userId: string): Promise<AgentConfig | undefined> {
    try {
      const agent = await this.loadAgent(slug)
      if (agent) console.log('[v0] Agent config source: supabase', { userId, slug })
      return agent
    } catch (error) {
      console.warn('[v0] Agent config fallback used', {
        userId,
        slug,
        reason: error instanceof Error ? error.message : 'Unknown Supabase error',
      })
      this.source = FALLBACK_CONFIG_SOURCE
      return getFallbackAgents().find((agent) => agent.slug === slug)
    }
  }

  async listAgents(userId: string): Promise<AgentConfig[]> {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('ai_agents')
        .select('id, name, slug, description, system_prompt, model, is_active, settings, created_at, updated_at')
        .eq('is_active', true)
        .order('slug')

      if (error) throw error
      const agents = await Promise.all((data ?? []).map((row) => this.loadAgent(row.slug)))
      return agents.filter((agent): agent is AgentConfig => Boolean(agent))
    } catch (error) {
      console.warn('[v0] Agent config fallback used', {
        userId,
        reason: error instanceof Error ? error.message : 'Unknown Supabase error',
      })
      this.source = FALLBACK_CONFIG_SOURCE
      return getFallbackAgents()
    }
  }
}

export class FallbackAgentConfigRepository implements AgentConfigRepository {
  getSource() {
    return FALLBACK_CONFIG_SOURCE
  }

  async getSupervisor(_userId: string) {
    return getFallbackSupervisor()
  }

  async getAgent(slug: string, _userId: string) {
    return getFallbackAgents().find((agent) => agent.slug === slug)
  }

  async listAgents(_userId: string) {
    return getFallbackAgents()
  }
}

export const agentConfigRepository: AgentConfigRepository =
  new SupabaseAgentConfigRepository()

export const fallbackAgentConfigRepository: AgentConfigRepository =
  new FallbackAgentConfigRepository()
