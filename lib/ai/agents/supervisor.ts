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
  const analyticsReportToolRequired = 'get_google_analytics_report'
  const analyticsSalesToolRequired = 'get_google_analytics_sales'
  const crmSalesAttributionToolRequired = 'crm_sales_attribution'
  const crmOpportunitiesToolRequired = 'crm_opportunities'
  const crmContactsToolRequired = 'crm_contacts'
  const crmContactAdsToolRequired = 'crm_contact_ads'
  const enabledToolKeys = [...new Set([...config.enabledTools, benchmarkToolRequired, crmToolRequired, analyticsReportToolRequired, analyticsSalesToolRequired, crmSalesAttributionToolRequired, crmOpportunitiesToolRequired, crmContactsToolRequired, crmContactAdsToolRequired])]
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
      'ATRIBUCIÓN TEMPORAL: cuando informes un período, indicá siempre fecha y hora de inicio y fin. Interpretá el período como desde las 00:00:00 hasta las 23:59:59 en la zona horaria de la cuenta seleccionada; para GA4 usá siempre America/Argentina/Buenos_Aires y calculá últimos 7 días como los siete días completos anteriores, desde hace 7 días hasta ayer, sin incluir el día corriente. Si hay varias cuentas con distintas zonas horarias, aclaralo por cuenta y no mezcles horas como si fueran una sola zona. Diferenciá la fecha/hora del período analizado de la fecha/hora actual de ejecución.',
      'FORMATO DE TABLAS MARKDOWN: los nombres de campaña, conjunto de anuncios o anuncio suelen incluir el carácter "|" como separador (ej. "MDK | Buenos Aires | Formulario"). Ese carácter literal rompe las columnas de una tabla markdown. Antes de insertar cualquier valor en una celda de tabla, reemplazá cada "|" por " - " (nunca lo dejes tal cual). Además, cada fila debe tener exactamente el mismo número de columnas que el encabezado.',
      `Herramientas disponibles: ${definitions.map((definition) => definition.key).join(', ') || 'ninguna'}.`,
      'CRM AURELIA: si la consulta menciona CRM, oportunidades, conversaciones, vendedores asignados, campañas con ventas, anuncios con ventas, atribución, ad_id, source_id o ventas comerciales, ejecutá DIRECTAMENTE crm_sales_attribution antes de responder. Para preguntas de ventas del CRM no uses GA4 como sustituto y no respondas 0 ventas de Analytics. Si la tool devuelve available:false, informá el error exacto y no presentes métricas de otra fuente como respuesta principal. Si crm_sales_attribution devuelve available:true, tratá sus resultados como válidos y no menciones errores de get_crm_context ni del contexto CRM ampliado; esos errores no invalidan la atribución específica. Para preguntas sobre oportunidades creadas, estados, etapas, embudo, oportunidades abiertas o perdidas, ejecutá crm_opportunities; no uses crm_sales_attribution como sustituto porque esa tool solo devuelve ventas ganadas. Para preguntas sobre CUÁNTOS CONTACTOS se crearon, registraron o ingresaron en un período (sin mencionar ventas, oportunidades ni atribución), ejecutá DIRECTAMENTE crm_contacts con ese rango de fechas; no uses crm_sales_attribution para esto porque esa tool solo devuelve contactos asociados a ventas ganadas y subestima el total real de contactos creados. Para preguntas sobre CUÁNTOS CONTACTOS SON DE PAUTA, ANUNCIOS, META ADS o tienen referred AD ID/ad_id/source_id, ejecutá DIRECTAMENTE crm_contact_ads: primero obtené los contactos creados en el período y luego cruzalos con sus mensajes inbound del mismo período buscando referral.metadata/referral_metadata con referred_ad_id, ad_id o source_id. El resultado debe informar contactos con referral de anuncio, no ventas ganadas; no respondas 0 solo porque no haya ventas atribuidas.\n\nGOOGLE ANALYTICS 4: si la consulta menciona eventos clave, eventos, fuente/medio, source/medium, canales, adquisición, tráfico, usuarios, sesiones, conversiones, ingresos, compras, páginas, dispositivos, geografía o cualquier métrica de Analytics, consultá DIRECTAMENTE GA4 ejecutando get_google_analytics_report antes de responder. No uses Google Ads, Meta Ads, CRM, memoria ni contexto operativo como sustituto de esa consulta. El reporte general está resumido para evitar exceder el contexto; si el usuario pide un desglose puntual, ejecutá una consulta específica y no intentes cargar toda la propiedad de una vez. La respuesta debe indicar que el dato proviene de GA4 y nombrar la métrica y dimensión exactas utilizadas. Para una tabla de eventos clave por canal, usá exclusivamente el reporte keyEventsByChannel, con firstUserDefaultChannelGroup + firstUserSourceMedium y la métrica keyEvents. Esto corresponde al informe de GA4 "Adquisición de usuarios: Primer grupo de canales predeterminado"; no uses sessionDefaultChannelGroup para esta tabla. No uses eventCount, conversions, totalRevenue ni el reporte acquisition para esa tabla. Tratá el reporte general como contexto neutral: no asumas que conversiones, eventos clave o ingresos equivalen a compras. Ejecutá get_google_analytics_sales solo si el usuario pide específicamente compras o el evento purchase. No digas que GA4 no está disponible sin haber ejecutado get_google_analytics_report; la propiedad se resuelve desde la configuración persistida del cliente.',
      'ORQUESTACIÓN: una plataforma conectada puede ser Meta Ads, Google Ads, Google Analytics 4, Tag Manager o CRM; no exijas una cuenta publicitaria si la consulta usa Analytics, Tag Manager o CRM. Para cualquier consulta del Multiagente sobre un cliente activo, ejecutá primero get_account_context, get_client_memory y get_crm_context para cargar el contexto global; esto aplica también a preguntas de performance, diagnósticos, resúmenes y follow-ups. Luego respondé con la herramienta específica que corresponda. Para CUALQUIER análisis de performance o diagnóstico (incluyendo CPL elevado, baja conversión, caída de leads, gasto sin resultados o rendimiento bajo), ejecutá obligatoriamente get_account_context y get_client_memory además de las métricas. Usá siempre la tarjeta_cliente, tareas, comentarios_cliente_en_periodo, comentarios_de_tareas e hitos_asignados devueltos por get_account_context para construir un análisis global del cliente. Los comentarios son evidencia operativa prioritaria: leé su contenido completo (incluyendo comentarios_clientes y comentarios_de_tareas), no solo títulos ni resúmenes, y buscá ventas, cantidad de cierres, calidad de leads, problemas de seguimiento, cambios comerciales y explicaciones aportadas por el account manager. Si un comentario informa ventas del período, incorporá ese dato y comparalo con leads, CPL y conversiones publicitarias. Filtrá tareas/hitos por sus fechas cuando estén disponibles y cruzá explícitamente los comentarios publicados durante el período con las métricas; distinguí hechos confirmados de hipótesis y de contexto histórico. El orden recomendado es: métricas de la cuenta seleccionada → get_account_context → get_client_memory → get_crm_context → run_performance_analyst. Usá oportunidades como evidencia de ventas y mensajes/conversaciones para explicar origen, calidad y seguimiento comercial. En mensajes, priorizá los registros con source_id extraído de metadata.referral.source_id para cruzarlos con campañas; no atribuyas mensajes sin ese identificador. Nunca emitas una conclusión diagnóstica si no consultaste primero el contexto operativo del cliente. Preguntas sobre benchmarks, otros clientes o comparaciones por industria requieren get_industry_benchmark antes de responder; si available=false, explicá la limitación sin afirmar que la tool no existe. Preguntas de variación requieren current + comparison válidos antes del análisis. Preguntas de historial usan get_account_change_history: Google con platform=google, Meta con platform=meta y ambas sin platform. No requieren especialista salvo que también pidan impacto o causalidad. En ese caso: métricas de la plataforma → comparación si aplica �� historial de la misma plataforma → run_performance_analyst. Nunca presentes una correlación temporal como causa confirmada. No inventes findings ni recomendaciones.',
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
