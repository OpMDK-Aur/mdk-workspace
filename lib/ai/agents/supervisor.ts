import { createOpenAI } from '@ai-sdk/openai'
import { hasToolCall, stepCountIs, streamText, tool } from 'ai'
import type { ModelMessage } from 'ai'
import { z } from 'zod'
import { isMonthlyReportRequest, VALIDATION_QUESTION } from '../monthly-report'
import { buildReportKpis, buildReportSections, CHART_KEYS, defaultRange, outputRange, REPORT_HEADINGS, type DateRange } from '../report-charts'
import { agentConfigRepository } from '../repositories/agent-repository'
import { getCatalogToolKeys, getToolDefinitions } from '../tools'
import type { ExecutionContext } from '../types'

const MAX_TOOL_OUTPUT_BYTES = 180_000

export const RENDER_REPORT_TOOL = 'renderReport'

const REPORT_INSTRUCTION = [
  'FORMATO DE RESPUESTA: Respondé siempre con renderReport. No escribas texto fuera de la tool.',
  'Cada sección tiene un heading, un text en markdown corto (máximo 4 bullets) y un chartKey. Orden: RESUMEN, GOOGLE ADS, META ADS, ANALYTICS, CRM, HALLAZGOS, RECOMENDACIONES, PRÓXIMOS PASOS.',
  'chartKey: GOOGLE ADS → leads_by_channel; META ADS → spend_by_platform; ANALYTICS → sessions_daily; CRM → crm_funnel; el resto → none. Los gráficos los arma el sistema con los datos reales del período actual y el anterior: no escribas sus números ni tablas.',
  'El sistema muestra arriba de la respuesta tarjetas con los totales (inversión, leads, CPL y ventas o CTR) y su variación: no los escribas. RESUMEN es solo 1 o 2 frases de lectura, sin cifras.',
  'No menciones gráficos ni tarjetas en el texto.',
  'Si una plataforma no tiene datos en el período, omití esa sección.',
].join(' ')

const MONTHLY_REPORT_INSTRUCTION = `MODO INFORME MENSUAL (prioridad sobre "INFORMES Y CLAUDE DESIGN"): en esta conversación el usuario pidió un informe mensual. NO ejecutes get_claude_design_prompt, NO escribas un prompt para Claude ni ofrezcas CTA: la interfaz se encarga de eso cuando el usuario valide los datos. Consultá Meta Ads, Google Ads y el CRM del mes pedido (si no se indica, el último mes cerrado) y del mes anterior. Respondé con el resumen de datos del mes usando estos títulos, en este orden: "**Período:**" (fechas exactas), "**Objetivo del informe:**", "**KPIs por plataforma**" (por plataforma: inversión, leads/resultados y CPL con valor actual, anterior y variación %), "**Funnel del CRM**", "**Hallazgos**" y "**Próximos pasos**". Respondé con renderReport: "Período" y "Objetivo del informe" van en RESUMEN, los KPIs en cada sección de plataforma, el funnel en CRM y los pasos en PRÓXIMOS PASOS. Si el usuario corrige un dato, aplicá la corrección y devolvé el resumen completo corregido. El text de PRÓXIMOS PASOS termina SIEMPRE con la línea exacta: "${VALIDATION_QUESTION}"`

function limitToolOutput(value: unknown) {
  const serialized = JSON.stringify(value)
  if (serialized.length <= MAX_TOOL_OUTPUT_BYTES) return value

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const compact: Record<string, unknown> = {
      available: record.available,
      period: record.period,
      totals: record.totals,
      truncated: true,
      truncation_notice: 'Se recortaron los listados individuales (contactos, mensajes, oportunidades detalladas) porque la salida original era muy grande. Los totales y el desglose agregado por campaña/cuenta SÍ están completos: usalos para responder directamente, sin pedirle al usuario que acote el pedido.',
    }

    // Estas claves son resúmenes agregados (no listados fila por fila), por
    // eso se preservan siempre: es lo que el modelo necesita para responder
    // "top campañas" o similares sin más consultas. by_campaign es el nombre
    // que usa crm_sales_attribution para su desglose agregado.
    for (const key of ['campaigns', 'by_campaign', 'accounts', 'summary', 'errors', 'message']) {
      if (key in record) compact[key] = record[key]
    }

    return compact
  }

  return {
    available: false,
    truncated: true,
    message: 'La herramienta devolvió demasiados datos. Repetí la consulta con un período, cuenta o filtro más acotado.',
  }
}

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

function messageText(message: ModelMessage | undefined) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
}

const REPORT_REQUEST_PATTERN = /\b(informe|reporte|report|claude design|cierre de mes|prompt)\b/i
const AFFIRMATIVE_PATTERN = /^\s*(s[ií]|dale|ok|okay|perfecto|de una|claro|armalo|arm[aá]lo|hacelo|pasamelo|pas[aá]melo|genial|bueno)\b/i

// Informes y prompts de Claude Design necesitan varias fuentes (Meta, Google,
// CRM, período anterior). El flujo normal limita a una sola tool de datos,
// lo que dejaba los informes con métricas vacías.
export function detectReportMode(messages: ModelMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user')
  const lastUser = messageText(userMessages.at(-1))
  if (REPORT_REQUEST_PATTERN.test(lastUser)) return true
  const lastAssistant = messageText(messages.filter((message) => message.role === 'assistant').at(-1))
  return /claude design|informe/i.test(lastAssistant) && AFFIRMATIVE_PATTERN.test(lastUser)
}

export function detectMonthlyReportMode(messages: ModelMessage[]) {
  return messages.some((message) => message.role === 'user' && isMonthlyReportRequest(messageText(message)))
}

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
  const crmAppointmentsToolRequired = 'crm_appointments'
  const claudeDesignToolRequired = 'get_claude_design_prompt'
  const enabledToolKeys = [...new Set([...config.enabledTools, benchmarkToolRequired, crmToolRequired, analyticsReportToolRequired, analyticsSalesToolRequired, crmSalesAttributionToolRequired, crmOpportunitiesToolRequired, crmContactsToolRequired, crmContactAdsToolRequired, crmAppointmentsToolRequired, claudeDesignToolRequired])]
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
  const requestedModel = context.model ?? config.model
  // El selector de Conexa solo expone o4-mini. Ignoramos valores antiguos o
  // inválidos que todavía puedan existir en ai_agents.model para que una
  // configuración histórica no deje el stream sin respuesta.
  const selectedModel = requestedModel === 'openai/o4-mini' ? requestedModel : 'openai/o4-mini'
  console.log('[v0] Supervisor model selected:', { requestedModel, selectedModel })
  const reportMode = detectReportMode(messages)
  const monthlyReportMode = detectMonthlyReportMode(messages)
  console.log('[v0] Supervisor report mode:', { reportMode, monthlyReportMode })
  // Claude Design necesita el prompt como texto copiable; el resto responde por secciones.
  const useReportTool = !reportMode || monthlyReportMode

  // Resultados crudos de las tools de datos de este turno, por tool + rango.
  // renderReport los reutiliza para armar los gráficos sin volver a consultar.
  const toolResults = new Map<string, Promise<Record<string, unknown> | null>>()
  const resultKey = (toolKey: string, range: DateRange) => `${toolKey}|${range.from}|${range.to}`
  let latestRange: DateRange | null = null
  const rememberResult = (toolKey: string, input: unknown, output: unknown) => {
    const range = outputRange(output, input)
    if (!range) return
    toolResults.set(resultKey(toolKey, range), Promise.resolve(output as Record<string, unknown>))
    if (!latestRange || range.from > latestRange.from) latestRange = range
  }
  const runTool = (toolKey: string, range: DateRange) => {
    const key = resultKey(toolKey, range)
    const cached = toolResults.get(key)
    if (cached) return cached
    const definition = getToolDefinitions([toolKey])[0]
    if (!definition) return Promise.resolve(null)
    const pending = Promise.resolve(definition.execute({ dateFrom: range.from, dateTo: range.to }, context))
      .then((output) => (output && typeof output === 'object' ? output as Record<string, unknown> : null))
      .catch(() => null)
    toolResults.set(key, pending)
    return pending
  }

  const renderReport = tool({
    description: 'Devuelve la respuesta completa dividida en secciones. Siempre usá esta tool para responder análisis de performance.',
    inputSchema: z.object({
      sections: z.array(z.object({
        heading: z.enum(REPORT_HEADINGS),
        text: z.string(),
        chartKey: z.enum(CHART_KEYS),
      })),
    }),
    execute: async ({ sections }) => {
      const comparison = context.analysisRunState?.comparisonDefinition?.current
      const current = comparison ? { from: comparison.from, to: comparison.to } : latestRange ?? defaultRange()
      const [kpis, resolvedSections] = await Promise.all([
        buildReportKpis(runTool, current).catch(() => []),
        buildReportSections(sections, runTool, current),
      ])
      return { kpis, sections: resolvedSections }
    },
  })

  const tools = {
    ...Object.fromEntries(
      definitions.map((definition) => [
        definition.key,
        tool({
          description: definition.description,
          inputSchema: definition.inputSchema,
          execute: async (input) => {
            const output = await definition.execute(input, context)
            rememberResult(definition.key, input, output)
            return limitToolOutput(output)
          },
        }),
      ]),
    ),
    ...(useReportTool ? { [RENDER_REPORT_TOOL]: renderReport } : {}),
  }
  const synthesisTools: Array<typeof RENDER_REPORT_TOOL> = useReportTool ? [RENDER_REPORT_TOOL] : []
  const synthesisChoice: { toolChoice?: { type: 'tool'; toolName: typeof RENDER_REPORT_TOOL } } = useReportTool
    ? { toolChoice: { type: 'tool', toolName: RENDER_REPORT_TOOL } }
    : {}

  return streamText({
    model: getGatewayModel(selectedModel),
    system: [
      config.systemPrompt,
      'No expongas secretos, tokens, claves ni credenciales. El contexto de ejecución ya fue provisto por el backend.',
      'AGENDAS / REUNIONES: si la consulta pregunta por agendas, reuniones, demos o turnos agendados en el CRM (y/o por las campañas de esas agendas), ejecutá DIRECTAMENTE crm_appointments: ya trae cada agenda cruzada con su canal, campaña y UTMs del CRM. Respondé primero con el dato pedido (cantidad, listado resumido, desglose by_campaign y by_channel). No digas que los contactos no tienen metadata ni recomiendes "cruzar datos" con el CRM: ese cruce ya lo hace la tool.',
      'INFORMES CON MÉTRICAS REALES: un informe nunca puede salir con campos vacíos si el dato se puede consultar. Antes de redactar, ejecutá get_account_context y luego TODAS las fuentes necesarias para el período pedido (si no se indica, el último mes cerrado): get_meta_metrics y get_google_metrics para el período actual Y el período anterior equivalente (para el "vs. anterior"), crm_opportunities y crm_sales_attribution (ventas y atribución), crm_contacts (leads en CRM vs plataforma) y, para el Plan Estratégico, además get_industry_benchmark y get_account_change_history. Solo marcá "sin dato" lo que una herramienta devolvió vacío o no disponible, aclarando cuál.',
  'INFORMES Y CLAUDE DESIGN: cuando el usuario pida un informe o el prompt para Claude Design, primero identificá el cliente, período y plan; consultá todas las métricas necesarias. Si falta un dato, una fecha, un objetivo, una acción o cualquier información necesaria, preguntáselo al usuario ANTES de entregar el informe/prompt. Cuando ya tengas todos los datos, presentá el informe o prompt COMPLETO y visible en la respuesta (incluí todas las secciones, slides, métricas, tablas y fuentes; no digas solamente "lo generé" ni lo ocultes detrás de un CTA). Después del bloque completo, cerrá pidiendo confirmación explícita: "¿Confirmás que querés generar este informe?" o, si pidió Claude Design, "¿Confirmás que querés usar este prompt para Claude Design?". NO muestres Crear informe, Ver prompt ni Ir a Claude Design antes de esa confirmación. Solo después de una respuesta afirmativa ejecutá/mostrá los CTA correspondientes. Si el usuario pide un informe de resultados, mensual, de cierre o estratégico, no confundas tener métricas con tener confirmación: primero completá la información, luego pedí confirmación. Si el usuario pide directamente el prompt para Claude Design, no muestres CTA todavía: ejecutá get_claude_design_prompt con dateFrom/dateTo del período pedido (si no lo indica, el último mes cerrado), preguntá cualquier dato faltante y, cuando el prompt esté completo, pedí confirmación explícita antes de mostrar Ver prompt o Ir a Claude Design. Si confirma, ejecutá get_claude_design_prompt con dateFrom/dateTo del período pedido (si no lo indica, el último mes cerrado). Esa tool ya trae todas las métricas reales en report_data; completá cada slide con esos números (inversión, leads, CPL, tabla por campaña, vs. anterior, ventas y atribución CRM, cambios). Ejecutá get_claude_design_prompt (detecta solo el plan del cliente: Esencial o Estratégico; Premium usa la plantilla Estratégica) y devolvé el prompt completo siguiendo sus fill_rules, con los datos del informe más reciente de la conversación. Si la tool indica que el cliente no tiene plan cargado, preguntá qué plantilla usar. En el texto previo al bloque, aclarale al usuario qué plantilla se usó y por qué (el plan del cliente).',
      'PROPUESTAS DE CRUCE: nunca abras la respuesta con recomendaciones metodológicas, advertencias genéricas o "sería conveniente cruzar los datos". Empezá siempre por el resultado. Si un cruce adicional que vos mismo podés ejecutar (por ejemplo CRM vs inversión/leads de Meta Ads o Google Ads) aportaría valor y no lo hiciste en este turno, cerrá la respuesta con UNA pregunta concreta ofreciéndolo, por ejemplo: "¿Querés que crucemos estos datos del CRM con la plataforma para ver inversión y costo por agenda de cada campaña?". Nunca le pidas al usuario que haga el cruce manualmente.',
      'EJECUCIÓN INMEDIATA: si la consulta pide un dato, métrica, cantidad o estado verificable, no escribas una explicación previa ni anuncies lo que vas a hacer. Ejecutá las herramientas necesarias y respondé despu��s con el resultado. El usuario solo debe ver la respuesta final y, durante la ejecución, las actividades de las herramientas.',
      'PROTOCOLO DE ORQUESTACIÓN ADAPTATIVA Y CRUCE: primero clasificá la intención de la consulta y elegí la fuente de verdad inicial. Para ventas, cierres, oportunidades ganadas o “cuántas ventas”, comenzá con crm_opportunities para obtener las oportunidades con estado won y sus contactos; después ejecutá crm_contact_ads o crm_sales_attribution para extraer utm_id/source_id de esos contactos; finalmente consultá la herramienta de la plataforma correspondiente (Meta Ads o Google Ads) para obtener gasto, campañas, anuncios y leads, y cruzá los IDs/UTM antes de redactar. Para leads de pauta comenzá por la plataforma y luego contrastá con crm_contacts/crm_contact_ads. Para contactos CRM comenzá por crm_contacts. Para gasto comenzá por la plataforma. Nunca uses una secuencia fija si la intención exige otra, pero siempre completá todos los nodos necesarios para responder la pregunta.',
      'CONTRATO DE CRUCE: cada resultado de una tool es evidencia para las siguientes. Conservá cliente, cuentas, período y zona horaria; no cruces resultados de otro cliente o período. Compará utm_id, source_id, campaign_id y ad_id con normalización estricta y reportá coincidencias y no coincidencias. El informe debe separar claramente: gasto de plataforma, leads/conversiones reportados por plataforma, contactos totales del CRM, contactos CRM con UTM, oportunidades won/ventas y ventas atribuibles. Para ventas por canal, `crm_sales_attribution.by_channel` es la fuente canónica del CRM: usá exactamente sus totales (Google, Meta y sin atribución) y no reemplaces esos valores por el conteo de la plataforma consultada. Las métricas de Meta/Google sirven para inversión, leads y validación de IDs; no prueban por sí solas cuántas ventas del CRM pertenecen a cada canal. Si una fuente no está disponible o no existe una coincidencia, informalo como “no disponible” o “sin coincidencias”; nunca lo conviertas en cero ni inventes nombres, importes o atribuciones. PROHIBIDO INVENTAR: nunca escribas un ID de cuenta, campaña, cliente, permiso, error, inversión o métrica que no aparezca literalmente en el resultado de una tool. Nunca uses IDs de ejemplo como act_1234567890. Si la tool devuelve errors, usá únicamente account_id/account_name/error de ese resultado; si no devuelve account_id, decí “la cuenta seleccionada” sin inventar uno. No afirmes que falta vinculación o permisos salvo que el error de la tool lo indique explícitamente; distinguí entre sin datos, error de API, cuenta no perteneciente al cliente y permisos insuficientes.',
      ...(useReportTool ? [REPORT_INSTRUCTION] : []),
      'RESPUESTA FINAL OBLIGATORIA: siempre terminá con una respuesta textual útil; nunca dejes el turno sin respuesta aunque una tool falle, tarde o devuelva datos parciales. Si una tool falla o agota el tiempo, explicá qué pudo validarse, qué dato falta y proponé el próximo paso concreto usando la evidencia disponible. Para consultas de CRM, la respuesta nunca puede ser solo un número ni un volcado de CRM: después de obtener el dato CRM, cruzalo obligatoriamente con pauta (Meta Ads/Google Ads según las cuentas disponibles) y, si no hay una cuenta de pauta conectada o no existe coincidencia, declaralo explícitamente y convertí esa diferencia en una recomendación de medición/atribución/seguimiento. Incluí siempre una sección “Lectura y recomendaciones” con al menos 2 recomendaciones accionables derivadas de los datos o de la brecha de datos. Las recomendaciones deben estar etiquetadas como “basada en datos” solo cuando exista evidencia cuantitativa; si no hay métricas, limitate a recomendaciones de diagnóstico/conexión y no sugieras presupuestos, CPA, frecuencia, segmentaciones o cambios de campaña como si fueran conclusiones. No afirmes que una cuenta tiene permisos insuficientes ni que está mal vinculada sin evidencia explícita en la tool. Incluí período exacto y zona horaria, fuente de cada cifra, fórmula o criterio de cruce, diferencias entre plataformas y CRM, y una sección de datos faltantes. No respondas hasta ejecutar las tools necesarias ni presentes una hipótesis como hecho.',
      'REGLA DE CRUCE CRM + PAUTA: si la consulta pide contactos, leads, oportunidades, ventas, campañas o cualquier dato del CRM, primero obtené la evidencia CRM y luego ejecutá al menos una tool de pauta disponible (get_meta_metrics o get_google_metrics) y/o crm_contact_ads/crm_sales_attribution para validar origen. Compará volumen CRM contra leads/conversiones de pauta, identificá atribuidos y no atribuidos, y redactá qué significa la diferencia para el negocio. Si solo hay una plataforma disponible, usá esa; si ninguna está disponible, respondé con la limitación y recomendaciones de instrumentación, sin fingir que el CRM está validado.',
      'TONO Y NIVEL DE ANÁLISIS: quien te consulta es un/a media buyer o account manager que va a usar tu respuesta como base de un reporte para su cliente final. No entregues un volcado de datos crudo (no listes las 76 campañas una por una si la mayoría tiene volumen bajo o nulo): agrupá, priorizá y contá una lectura. Estructura recomendada: (1) 2-3 frases de lectura general (qué pasó, si es bueno o malo, y por qué, en lenguaje de negocio); (2) 3 a 6 filas con las campañas o cuentas que más aportaron o más llaman la atención (mejores y peores), no la lista completa salvo que el usuario la pida explícitamente; (3) 1-2 frases de conclusión o próximo paso sugerido (ej. qué campaña escalar, cuál pausar, qué falta investigar). Sé concreto y breve: preferí una respuesta corta y bien jerarquizada a una extensa. Si hay muchas filas con cifras en cero o insignificantes, agrupalas en una sola línea tipo "otras N campañas sin leads/ventas en el período" en vez de listarlas.',
      'ATRIBUCIÓN TEMPORAL: cuando informes un período, indicá siempre fecha y hora de inicio y fin. Interpretá el período como desde las 00:00:00 hasta las 23:59:59 en la zona horaria de la cuenta seleccionada; para GA4 usá siempre America/Argentina/Buenos_Aires y calculá últimos 7 días como los siete días completos anteriores, desde hace 7 días hasta ayer, sin incluir el día corriente. Si hay varias cuentas con distintas zonas horarias, aclaralo por cuenta y no mezcles horas como si fueran una sola zona. Diferenciá la fecha/hora del período analizado de la fecha/hora actual de ejecución.',
      'FORMATO DE TABLAS MARKDOWN: los nombres de campaña, conjunto de anuncios o anuncio suelen incluir el carácter "|" como separador (ej. "MDK | Buenos Aires | Formulario"). Ese carácter literal rompe las columnas de una tabla markdown. Antes de insertar cualquier valor en una celda de tabla, reemplazá cada "|" por " - " (nunca lo dejes tal cual). Además, cada fila debe tener exactamente el mismo número de columnas que el encabezado.',
      `Herramientas disponibles: ${definitions.map((definition) => definition.key).join(', ') || 'ninguna'}.`,
      'CRM AURELIA: si la consulta menciona CRM, oportunidades, conversaciones, vendedores asignados, campañas con ventas, anuncios con ventas, atribución, ad_id, source_id o ventas comerciales, ejecutá DIRECTAMENTE crm_sales_attribution antes de responder. Para preguntas de ventas del CRM no uses GA4 como sustituto y no respondas 0 ventas de Analytics. Si la tool devuelve available:false, tradulo a una explicación breve y en lenguaje de negocio de qué dato falta o no se pudo cruzar (por ejemplo "no se encontró información de campaña en los mensajes del período"); nunca le muestres al usuario el mensaje de error técnico crudo (cosas como "Bad Request", códigos HTTP, stack traces o nombres de tablas/columnas), y no presentes métricas de otra fuente como respuesta principal. Si crm_sales_attribution devuelve available:true, tratá sus resultados como válidos y no menciones errores de get_crm_context ni del contexto CRM ampliado; esos errores no invalidan la atribución específica. Al reportar by_campaign, mostrale al usuario siempre el campo campaign (el NOMBRE de campaña ya resuelto); nunca muestres ad_id ni utm_id como si fueran el nombre de la campaña, esos campos son solo referencia interna para cruzar con Meta Ads/Google Ads. by_campaign viene siempre completo y ordenado de mayor a menor por ventas, nunca truncado: si el usuario pide "la/las campaña(s) que mejor performó/performaron" sin decir un número, respondé DIRECTAMENTE con el top 3 de by_campaign (o menos si hay menos de 3 campañas atribuidas); no le pidas al usuario que elija cuántas campañas quiere ver ni digas que el desglose "superó el límite de payload" o fue truncado, porque by_campaign no se recorta nunca. Para preguntas sobre oportunidades creadas, estados, etapas, embudo, oportunidades abiertas o perdidas, ejecutá crm_opportunities; no uses crm_sales_attribution como sustituto porque esa tool solo devuelve ventas ganadas. Para preguntas sobre CUÁNTOS CONTACTOS se crearon, registraron o ingresaron en un período (sin mencionar ventas, oportunidades ni atribución), ejecutá DIRECTAMENTE crm_contacts con ese rango de fechas; no uses crm_sales_attribution para esto porque esa tool solo devuelve contactos asociados a ventas ganadas y subestima el total real de contactos creados. Para preguntas sobre CUÁNTOS CONTACTOS SON DE PAUTA, ANUNCIOS, META ADS o tienen utm_id, ejecutá DIRECTAMENTE crm_contact_ads: primero obtené los contactos creados en el período y luego cruzalos con sus mensajes del mismo período buscando metadata/referral/message_data con utm_id. El resultado debe informar contactos con UTM ID, no ventas ganadas; no respondas 0 solo porque no haya ventas atribuidas. Si el usuario pregunta después "¿de qué campañas?", "¿cuáles campañas?" o pide el desglose, reutilizá el período del turno anterior y ejecutá crm_contact_ads; respondé usando el campo campaigns del resultado, agrupando por nombre de campaña cuando exista y, si no existe, por Ad ID. No vuelvas a consultar ventas ni GA4 para ese follow-up.\n\nGOOGLE ANALYTICS 4: si la consulta menciona eventos clave, eventos, fuente/medio, source/medium, canales, adquisición, tráfico, usuarios, sesiones, conversiones, ingresos, compras, páginas, dispositivos, geografía o cualquier métrica de Analytics, consultá DIRECTAMENTE GA4 ejecutando get_google_analytics_report antes de responder. No uses Google Ads, Meta Ads, CRM, memoria ni contexto operativo como sustituto de esa consulta. El reporte general está resumido para evitar exceder el contexto; si el usuario pide un desglose puntual, ejecutá una consulta específica y no intentes cargar toda la propiedad de una vez. La respuesta debe indicar que el dato proviene de GA4 y nombrar la métrica y dimensión exactas utilizadas. Para una tabla de eventos clave por canal, usá exclusivamente el reporte keyEventsByChannel, con firstUserDefaultChannelGroup + firstUserSourceMedium y la métrica keyEvents. Esto corresponde al informe de GA4 "Adquisición de usuarios: Primer grupo de canales predeterminado"; no uses sessionDefaultChannelGroup para esta tabla. No uses eventCount, conversions, totalRevenue ni el reporte acquisition para esa tabla. Tratá el reporte general como contexto neutral: no asumas que conversiones, eventos clave o ingresos equivalen a compras. Ejecutá get_google_analytics_sales solo si el usuario pide específicamente compras o el evento purchase. No digas que GA4 no está disponible sin haber ejecutado get_google_analytics_report; la propiedad se resuelve desde la configuración persistida del cliente.',
      'GA4 PÁGINAS: cuando el usuario pregunte por vistas, usuarios, sesiones, engagement, eventos, conversiones, ingresos, compras o adquisición de una URL/página específica (por ejemplo /webinar), ejecutá DIRECTAMENTE get_google_analytics_page_metrics con pagePath exacto y el período solicitado. La tool devuelve un conjunto amplio de métricas; seleccioná las relevantes para la pregunta y no exijas nombres técnicos al usuario. No uses get_google_analytics_report.pages para responder el total, porque ese reporte combina pageTitle, pagePath y landingPagePlusQueryString y puede devolver filas parciales o duplicadas. Si el usuario menciona un rango como desde el 11 hasta hoy, usá dateFrom=2026-09-11 y dateTo=la fecha actual de la cuenta en America/Argentina/Buenos_Aires.',
      'ORQUESTACIÓN: una plataforma conectada puede ser Meta Ads, Google Ads, Google Analytics 4, Tag Manager o CRM; no exijas una cuenta publicitaria si la consulta usa Analytics, Tag Manager o CRM. Para cualquier consulta del Multiagente sobre un cliente activo, ejecutá una sola vez get_account_context, get_client_memory y get_crm_context para cargar el contexto global; el resultado de get_account_context queda cacheado durante este turno y no debe volver a invocarse; esto aplica también a preguntas de performance, diagnósticos, resúmenes y follow-ups. Luego respondé con la herramienta específica que corresponda. Para CUALQUIER análisis de performance o diagnóstico (incluyendo CPL elevado, baja conversión, caída de leads, gasto sin resultados o rendimiento bajo), ejecutá obligatoriamente get_account_context y get_client_memory además de las métricas. Usá siempre la tarjeta_cliente, tareas, comentarios_cliente_en_periodo, comentarios_de_tareas e hitos_asignados devueltos por get_account_context para construir un análisis global del cliente. Los comentarios son evidencia operativa prioritaria: leé su contenido completo (incluyendo comentarios_clientes y comentarios_de_tareas), no solo títulos ni resúmenes, y buscá ventas, cantidad de cierres, calidad de leads, problemas de seguimiento, cambios comerciales y explicaciones aportadas por el account manager. Si un comentario informa ventas del período, incorporá ese dato y comparalo con leads, CPL y conversiones publicitarias. Filtrá tareas/hitos por sus fechas cuando estén disponibles y cruzá explícitamente los comentarios publicados durante el período con las métricas; distinguí hechos confirmados de hipótesis y de contexto histórico. El orden recomendado es: métricas de la cuenta seleccionada → get_account_context → get_client_memory → get_crm_context → run_performance_analyst. Usá oportunidades como evidencia de ventas y mensajes/conversaciones para explicar origen, calidad y seguimiento comercial. En mensajes, priorizá los registros con source_id extraído de metadata.referral.source_id para cruzarlos con campañas; no atribuyas mensajes sin ese identificador. Nunca emitas una conclusión diagnóstica si no consultaste primero el contexto operativo del cliente. Preguntas sobre benchmarks, otros clientes o comparaciones por industria requieren get_industry_benchmark antes de responder; si available=false, explicá la limitación sin afirmar que la tool no existe. Preguntas de variación requieren current + comparison válidos antes del análisis. Preguntas de historial usan get_account_change_history: Google con platform=google, Meta con platform=meta y ambas sin platform. No requieren especialista salvo que también pidan impacto o causalidad. En ese caso: métricas de la plataforma → comparación si aplica �� historial de la misma plataforma → run_performance_analyst. Nunca presentes una correlación temporal como causa confirmada. No inventes findings ni recomendaciones.',
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
      ...(monthlyReportMode ? [MONTHLY_REPORT_INSTRUCTION] : []),
      ...(context.conversationWorkingContext ? [`CONTEXTO ESTRUCTURADO DE CONVERSACIÓN (prioridad sobre defaults): ${JSON.stringify(context.conversationWorkingContext)}. Para “estos cambios”, “esos cambios” o “últimos cambios”, reutilizá exactamente referenced_change_events y no hagas una búsqueda genérica. Para cuentas, campañas, grupos y períodos reutilizá sus IDs y fechas. Si hay varias cuentas, agrupá por plataforma + cuenta; nunca elijas una arbitrariamente. Si el contexto tiene otro client_id, no lo uses.`] : []),
      ...(context.analysisRunState?.comparisonDefinition ? [`El backend detectó una comparación obligatoria. Consultá primero el período CURRENT ${context.analysisRunState.comparisonDefinition.current.from} a ${context.analysisRunState.comparisonDefinition.current.to}; luego consultá el período COMPARISON ${context.analysisRunState.comparisonDefinition.comparison.from} a ${context.analysisRunState.comparisonDefinition.comparison.to}, usando la misma plataforma y cuentas. Finalmente ejecutá run_performance_analyst. No afirmes subidas o bajadas sin ambos períodos.`] : []),
    ].join('\n\n'),
    messages,
    tools,
  // El modelo puede necesitar varios turnos de herramientas para cruzar CRM,
  // atribución y plataformas antes de redactar la respuesta final. Le damos
  // margen suficiente para cruzar CRM + pauta, pero con un límite acotado
  // para evitar que el supervisor encadene tools indefinidamente y deje el
  // stream sin una respuesta final.
  stopWhen: [stepCountIs(15), hasToolCall(RENDER_REPORT_TOOL)],
  // Si llegamos cerca del límite de pasos sin que el modelo haya redactado
  // todavía la respuesta final, le quitamos las tools en el último paso
  // disponible para forzarlo a sintetizar con lo que ya recolectó.
  prepareStep: ({ stepNumber, steps }) => {
    // o4-mini a veces da por terminado el turno justo después de recibir
    // get_account_context: devuelve finishReason=stop pero sin texto ni otra
    // tool call. En una consulta de CRM/pauta eso es una respuesta inválida.
    // Obligamos un paso adicional de herramientas para que consulte métricas,
    // atribución o CRM antes de sintetizar.
    const loadedAccountContext = steps.some((step) => step.toolCalls?.some((call) => call?.toolName === 'get_account_context'))
    if (reportMode) {
      if (stepNumber < 14) return undefined
      return {
        activeTools: synthesisTools,
      ...synthesisChoice,
        system: 'Redactá AHORA el informe o prompt COMPLETO, con todas las secciones, usando todas las métricas obtenidas. No lo cortes ni lo resumas.',
      }
    }
    if (stepNumber === 1 && loadedAccountContext) {
      return {
        toolChoice: 'required' as const,
        system: 'Ya cargaste las cuentas. Ejecutá UNA SOLA herramienta de datos directamente relacionada con la pregunta (CRM, atribución, Meta Ads o Google Ads). No ejecutes get_account_context otra vez ni encadenes otra tool después.',
      }
    }
    // Después de una única consulta de datos, el siguiente paso siempre es
    // síntesis. Esto evita que o4-mini consuma todos los tokens encadenando
    // herramientas y termine con finishReason=length sin texto.
    if (stepNumber >= 2 && loadedAccountContext) {
      return {
        activeTools: synthesisTools,
      ...synthesisChoice,
        system: 'No ejecutes más herramientas de datos. Redactá AHORA la respuesta final con lo obtenido. Cruzá CRM y pauta si existe evidencia; si falta una fuente, declaralo y agregá recomendaciones accionables.',
      }
    }
    if (stepNumber < 14) return undefined
    return {
      activeTools: synthesisTools,
      ...synthesisChoice,
      system: 'Redactá AHORA la respuesta final únicamente con los resultados obtenidos. Si algún cruce quedó incompleto, aclaralo como dato faltante y agregá recomendaciones.',
    }
  },
  temperature: 0.2,
    // o4-mini gasta tokens de razonamiento antes del texto; un informe
    // Estratégico de 11 slides con datos no entra en 4000 y salía cortado.
    maxOutputTokens: reportMode ? 24000 : 4000,
  })
}
