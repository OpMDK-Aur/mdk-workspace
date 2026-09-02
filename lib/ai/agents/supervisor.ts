import { createOpenAI } from '@ai-sdk/openai'
import { stepCountIs, streamText, tool } from 'ai'
import type { ModelMessage } from 'ai'
import { agentConfigRepository } from '../repositories/agent-repository'
import { getCatalogToolKeys, getToolDefinitions } from '../tools'
import type { ExecutionContext } from '../types'

function getGatewayModel(model: string) {
  const gateway = createOpenAI({
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseURL: 'https://ai-gateway.vercel.sh/v1',
  })

  return gateway.chat(model)
}

// El contenido de cada mensaje suele ser texto plano, pero el turno actual
// puede incluir además archivos adjuntos (imagen/PDF como parte multimodal,
// o texto extraído de CSV/Excel ya inyectado como parte de texto adicional).
export type SupervisorModelMessage = ModelMessage

export async function streamSupervisorResponse(
  messages: SupervisorModelMessage[],
  context: ExecutionContext,
) {
  const config = await agentConfigRepository.getSupervisor(context.userId)
  const catalogToolKeys = getCatalogToolKeys()
  const benchmarkToolRequired = 'get_industry_benchmark'
  const crmToolRequired = 'get_crm_context'
  const enabledToolKeys = [...new Set([...config.enabledTools, benchmarkToolRequired, crmToolRequired])]
  const definitions = getToolDefinitions(enabledToolKeys)
  const exposedToolKeys = definitions.map((definition) => definition.key)
  console.log('[multiagent-tools]', {
    agentSlug: 'supervisor',
    enabledToolKeys,
    catalogToolKeys,
    exposedToolKeys,
  })
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
      'ATRIBUCIÓN TEMPORAL: cuando informes un período, indicá siempre fecha y hora de inicio y fin. Interpretá el período como desde las 00:00:00 hasta las 23:59:59 en la zona horaria de la cuenta seleccionada; usá la zona_horaria devuelta por el contexto. Si hay varias cuentas con distintas zonas horarias, aclaralo por cuenta y no mezcles horas como si fueran una sola zona. Diferenciá la fecha/hora del período analizado de la fecha/hora actual de ejecución.',
      'FORMATO DE TABLAS MARKDOWN: los nombres de campaña, conjunto de anuncios o anuncio suelen incluir el carácter "|" como separador (ej. "MDK | Buenos Aires | Formulario"). Ese carácter literal rompe las columnas de una tabla markdown. Antes de insertar cualquier valor en una celda de tabla, reemplazá cada "|" por " - " (nunca lo dejes tal cual). Además, cada fila debe tener exactamente el mismo número de columnas que el encabezado.',
      `Herramientas disponibles: ${definitions.map((definition) => definition.key).join(', ') || 'ninguna'}.`,
      'ORQUESTACIÓN: para cualquier consulta del Multiagente sobre un cliente activo, ejecutá primero get_account_context, get_client_memory y get_crm_context para cargar el contexto global; esto aplica también a preguntas de performance, diagnósticos, resúmenes y follow-ups. Luego respondé con la herramienta específica que corresponda. Para CUALQUIER análisis de performance o diagnóstico (incluyendo CPL elevado, baja conversión, caída de leads, gasto sin resultados o rendimiento bajo), ejecutá obligatoriamente get_account_context y get_client_memory además de las métricas. Usá siempre la tarjeta_cliente, tareas, comentarios_cliente_en_periodo, comentarios_de_tareas e hitos_asignados devueltos por get_account_context para construir un análisis global del cliente. Los comentarios son evidencia operativa prioritaria: leé su contenido completo (incluyendo comentarios_clientes y comentarios_de_tareas), no solo títulos ni resúmenes, y buscá ventas, cantidad de cierres, calidad de leads, problemas de seguimiento, cambios comerciales y explicaciones aportadas por el account manager. Si un comentario informa ventas del período, incorporá ese dato y comparalo con leads, CPL y conversiones publicitarias. Filtrá tareas/hitos por sus fechas cuando estén disponibles y cruzá explícitamente los comentarios publicados durante el período con las métricas; distinguí hechos confirmados de hipótesis y de contexto histórico. El orden recomendado es: métricas de la cuenta seleccionada → get_account_context → get_client_memory → get_crm_context → run_performance_analyst. Usá oportunidades como evidencia de ventas y mensajes/conversaciones para explicar origen, calidad y seguimiento comercial. Nunca emitas una conclusión diagnóstica si no consultaste primero el contexto operativo del cliente. Preguntas sobre benchmarks, otros clientes o comparaciones por industria requieren get_industry_benchmark antes de responder; si available=false, explicá la limitación sin afirmar que la tool no existe. Preguntas de variación requieren current + comparison válidos antes del análisis. Preguntas de historial usan get_account_change_history: Google con platform=google, Meta con platform=meta y ambas sin platform. No requieren especialista salvo que también pidan impacto o causalidad. En ese caso: métricas de la plataforma → comparación si aplica → historial de la misma plataforma → run_performance_analyst. Nunca presentes una correlación temporal como causa confirmada. No inventes findings ni recomendaciones.',
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
      ...(context.conversationWorkingContext ? [`CONTEXTO ESTRUCTURADO DE CONVERSACIÓN (prioridad sobre defaults): ${JSON.stringify(context.conversationWorkingContext)}. Para “estos cambios”, “esos cambios” o “últimos cambios”, reutilizá exactamente referenced_change_events y no hagas una búsqueda genérica. Para cuentas, campañas, grupos y períodos reutilizá sus IDs y fechas. Si hay varias cuentas, agrupá por plataforma + cuenta; nunca elijas una arbitrariamente. Si el contexto tiene otro client_id, no lo uses.`] : []),
      ...(context.analysisRunState?.comparisonDefinition ? [`El backend detectó una comparación obligatoria. Consultá primero el período CURRENT ${context.analysisRunState.comparisonDefinition.current.from} a ${context.analysisRunState.comparisonDefinition.current.to}; luego consultá el período COMPARISON ${context.analysisRunState.comparisonDefinition.comparison.from} a ${context.analysisRunState.comparisonDefinition.comparison.to}, usando la misma plataforma y cuentas. Finalmente ejecutá run_performance_analyst. No afirmes subidas o bajadas sin ambos períodos.`] : []),
    ].join('\n\n'),
    messages,
    tools,
    stopWhen: stepCountIs(4),
    temperature: 0.2,
    maxOutputTokens: 1200,
  })
}
