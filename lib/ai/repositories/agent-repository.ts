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

/**
 * Supabase-ready repository boundary. The final table/column mapping is
 * intentionally not assumed until the schema is provided by the project owner.
 * Once confirmed, only this repository needs to change.
 */
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
  new FallbackAgentConfigRepository()
