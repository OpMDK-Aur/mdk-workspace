import { z } from 'zod'
import type { AnalysisRunState } from './contracts/performance-analyst'

// ===== Agent Configuration =====
export interface AgentConfig {
  id: string
  name: string
  slug: string
  description: string
  systemPrompt: string
  model: string
  isActive: boolean
  enabledTools: string[]
  settings?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// ===== Execution Context =====
export type ActivityStatus = 'running' | 'completed' | 'error'

export interface ActivityEvent {
  eventId: string
  runId?: string | null
  toolKey?: string
  agentSlug?: string
  status: ActivityStatus
  label: string
  timestamp: string
}

export interface ExecutionContext {
  userId: string
  userEmail?: string
  clientId?: string
  accountId?: string
  metaAccountId?: string
  googleCustomerId?: string
  /** Run-scoped only: never persisted; conversation memory is separate. */
  analysisRunState?: AnalysisRunState
  metadata?: Record<string, unknown>
  emitActivity?: (event: Omit<ActivityEvent, 'eventId' | 'timestamp'>) => void
}

// ===== Tool Definition =====
export interface ToolDefinition {
  key: string
  description: string
  inputSchema: z.ZodType<any>
  execute: (input: any, context: ExecutionContext) => Promise<any>
  isEnabled?: boolean
}

// ===== Agent Execution =====
export interface AgentExecutionRequest {
  query: string
  context: ExecutionContext
}

export interface AgentExecutionResult {
  success: boolean
  response: string
  toolsUsed?: string[]
  executionTime?: number
  error?: string
}

// ===== Supervisor Configuration =====
export interface SupervisorConfig {
  id: string
  name: string
  systemPrompt: string
  model: string
  isActive: boolean
  delegateAgents: string[] // agent IDs
  enabledTools: string[]
  createdAt: Date
  updatedAt: Date
  configSource?: 'supabase' | 'fallback'
  fallbackUsed?: boolean
  fallbackReason?: string
}
