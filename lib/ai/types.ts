import { z } from 'zod'

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
export interface ExecutionContext {
  userId: string
  userEmail?: string
  clientId?: string
  accountId?: string
  metaAccountId?: string
  googleCustomerId?: string
  metadata?: Record<string, unknown>
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
}
