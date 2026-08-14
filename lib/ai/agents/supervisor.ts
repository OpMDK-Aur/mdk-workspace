import { createOpenAI } from '@ai-sdk/openai'
import { stepCountIs, streamText, tool } from 'ai'
import { agentConfigRepository } from '../repositories/agent-repository'
import { getToolDefinitions } from '../tools'
import type { ExecutionContext } from '../types'

function getGatewayModel(model: string) {
  const gateway = createOpenAI({
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseURL: 'https://ai-gateway.vercel.sh/v1',
  })

  return gateway.chat(model)
}

export async function streamSupervisorResponse(
  query: string,
  context: ExecutionContext,
) {
  const config = await agentConfigRepository.getSupervisor(context.userId)
  const definitions = getToolDefinitions(config.enabledTools)
  console.log('[v0] Supervisor execution config', {
    source: config.configSource ?? agentConfigRepository.getSource(),
    agent_slug: 'supervisor',
    agent_id: config.id,
    model: config.model,
    updated_at: config.updatedAt.toISOString(),
    enabled_tools_count: definitions.length,
    fallback_used: config.fallbackUsed ?? false,
    ...(config.fallbackReason ? { fallback_reason: config.fallbackReason } : {}),
  })
  console.log('[v0] Supervisor model selected:', config.model)
  const tools = Object.fromEntries(
    definitions.map((definition) => [
      definition.key,
      tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: (input) => definition.execute(input, context),
      }),
    ]),
  )

  let stepIndex = 0

  return streamText({
    model: getGatewayModel(config.model),
    system: [
      config.systemPrompt,
      'No expongas secretos, tokens, claves ni credenciales. El contexto de ejecución ya fue provisto por el backend.',
      `Herramientas disponibles: ${definitions.map((definition) => definition.key).join(', ') || 'ninguna'}.`,
    ].join('\n\n'),
    prompt: query,
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0.2,
    maxOutputTokens: 1200,
    onStepFinish: (step) => {
      stepIndex += 1
      console.log('[v0] Supervisor step finished', {
        step_index: stepIndex,
        finish_reason: step.finishReason,
        tool_calls_count: step.toolCalls.length,
        tool_names: step.toolCalls.map((call) => call.toolName),
        text_length: step.text.length,
      })
    },
    onFinish: (result) => {
      console.log('[v0] Supervisor stream finished', {
        steps_count: stepIndex,
        final_text_generated: result.text.length > 0,
        final_text_preview: result.text.slice(0, 200),
        finish_reason: result.finishReason,
      })
    },
  })
}
