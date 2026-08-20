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

export type SupervisorModelMessage = { role: 'user' | 'assistant'; content: string }

export async function streamSupervisorResponse(
  messages: SupervisorModelMessage[],
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

  return streamText({
    model: getGatewayModel(config.model),
    system: [
      config.systemPrompt,
      'No expongas secretos, tokens, claves ni credenciales. El contexto de ejecución ya fue provisto por el backend.',
      `Herramientas disponibles: ${definitions.map((definition) => definition.key).join(', ') || 'ninguna'}.`,
      'REGLA OBLIGATORIA: si la consulta menciona historial, cambios, modificaciones, changelog o qué se cambió en Google Ads, ejecutá get_google_change_history antes de responder. La herramienta está habilitada para este agente; no digas que no existe ni que no está disponible sin haberla ejecutado.',
      // Reglas de memoria conversacional: los "messages" ya incluyen el
      // historial reciente de esta conversación (más antiguo primero) más
      // la consulta actual al final. Un follow-up corto ("¿Impresiones?",
      // "¿Y conversiones?") debe interpretarse en el contexto del turno
      // anterior (mismo cliente, plataforma, cuentas y período), salvo que
      // el usuario indique explícitamente lo contrario. No volver a
      // preguntar datos (período, plataforma, cuenta) que ya surgen del
      // historial. Igualmente, para responder con números actuales siempre
      // hay que volver a ejecutar la tool correspondiente: el historial da
      // contexto para armar la tool call, no reemplaza la consulta de datos.
      'Los "messages" incluyen el historial reciente de esta conversación seguido de la consulta actual. Si la consulta actual es un follow-up (ej. "¿Impresiones?", "¿Y conversiones?", "¿Cuál rindió mejor?"), interpretalo con el mismo cliente, plataforma, cuentas y período del turno anterior salvo que el usuario diga lo contrario, y no vuelvas a preguntar esos datos si ya están en el historial. Para responder igual siempre volvés a ejecutar la herramienta correspondiente con ese contexto heredado: el historial ayuda a construir la tool call, no sustituye la consulta de datos actuales.',
      ...(context.analysisRunState?.comparisonDefinition ? [`El backend detectó una comparación obligatoria. Consultá primero el período CURRENT ${context.analysisRunState.comparisonDefinition.current.from} a ${context.analysisRunState.comparisonDefinition.current.to}; luego consultá el período COMPARISON ${context.analysisRunState.comparisonDefinition.comparison.from} a ${context.analysisRunState.comparisonDefinition.comparison.to}, usando la misma plataforma y cuentas. Finalmente ejecutá run_performance_analyst.`] : []),
    ].join('\n\n'),
    messages,
    tools,
    stopWhen: stepCountIs(4),
    temperature: 0.2,
    maxOutputTokens: 1200,
  })
}
