import { randomUUID } from 'node:crypto'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExecutionContext } from '@/lib/ai/types'
import { getToolDefinitions } from '@/lib/ai/tools'
import { dateRange } from '@/lib/conexa/period-range'
import { MAX_BUDGET_CHANGE, MAX_RECS_PER_RUN, MIN_DAYS_OF_DATA, MIN_SPEND_MULTIPLIER_NO_RESULTS, RECENT_EDIT_WINDOW_DAYS } from './config'
import { buildEntityCatalog, catalogSourceItems, type EntityCatalog } from './entity-catalog'
import { normalizeOperation, rawOperationSchema } from './operations'
import { CopilotError } from './route-helpers'
import { createRecommendationDrafts, editRecommendation, getCopilotContext, listMessages, listRecommendations } from './store'
import type { Recommendation, RecommendationDraft, RecommendationPlatform, RecommendationType } from './types'
import { operationDedupeKey, validateOperation, type LinkedAccounts } from './validation'

export type RunMode = 'scan' | 'chat'
export const SCAN_MESSAGE = 'Analizá los últimos 30 días y proponé recomendaciones'
const MANUAL_REASON = 'La acción no corresponde a pausar/activar, cambiar presupuesto diario o ajustar la edad; se aplica a mano.'

const TYPE_VALUES = ['presupuesto', 'creatividades', 'segmentacion', 'estructura', 'tracking', 'crm', 'otro'] as const satisfies readonly RecommendationType[]
const PLATFORM_VALUES = ['meta', 'google_ads', 'ga4', 'tag_manager', 'crm'] as const satisfies readonly RecommendationPlatform[]
const modelSchema = z.object({
  reply: z.string().min(1).max(1600),
  needsClarification: z.boolean(),
  questions: z.array(z.string().min(1).max(240)).max(5),
  contextToSave: z.array(z.string().min(3).max(600)).max(5),
  recommendations: z.array(z.object({
    title: z.string().min(5).max(140),
    platforms: z.array(z.enum(PLATFORM_VALUES)).max(5),
    type: z.enum(TYPE_VALUES),
    priority: z.enum(['alta', 'media', 'baja']),
    description: z.string().min(20).max(900),
    rationale: z.string().min(20).max(1000),
    suggested_actions: z.array(z.string().min(5).max(300)).min(1).max(8),
    expected_impact: z.string().min(5).max(400),
    evidenceIds: z.array(z.string()).min(1).max(12),
    operation: rawOperationSchema.nullable(),
    nonExecutableReason: z.string().max(400),
  })).max(MAX_RECS_PER_RUN),
})
type ModelOutput = z.infer<typeof modelSchema>

const SYSTEM_PROMPT = `Sos Conexa, copiloto de recomendaciones para el equipo de MDK. Respondé en español rioplatense, claro y conciso.

ALCANCE: podés leer contexto, tareas, comentarios, datos de plataformas e historial; preguntar; y proponer recomendaciones como borradores. Nunca publiques, apruebes, descartes, programes ni ejecutes nada, y no afirmes que lo hiciste: una persona revisa cada borrador y lo ejecuta con el botón Publicar. No modifiques el formulario original de Contexto del cliente. Si te piden una acción fuera de alcance, explicá que solo redactás borradores y sugerí el paso manual correspondiente.

MODO DE TRABAJO (runMode):
- "scan": análisis proactivo. Revisá los datos del cliente y proponé hasta ${MAX_RECS_PER_RUN} recomendaciones, ordenadas por impacto esperado. No hagas preguntas salvo que falte algo que bloquee todas las propuestas. contextToSave va vacío.
- "chat": respondé al mensaje. Si piden recomendaciones en general ("qué hacemos", "qué mejorarías"), tratalo como scan. Si piden algo concreto, armá esa recomendación.
En ambos modos, si los datos alcanzan, proponé en lugar de preguntar. Preguntá (y devolvé recommendations vacío) solo cuando falte un dato que cambia la decisión y no esté en el contexto ni en los datos. Si podés proponer algunas recomendaciones y otras no, proponé las primeras y aclará en reply qué te faltó.

FUNDAMENTO: usá exclusivamente los datos entregados. No inventes métricas, hechos, restricciones ni impacto cuantitativo. Cada propuesta incluye evidenceIds válidos de sourceItems; sin evidencia concreta, no generes recomendación. Citá siempre métrica, valor, período y cuenta. Si no podés estimar el impacto con los datos, escribí "Sin estimación".
PRIORIDADES: las notas guardadas y los comentarios del equipo (promociones, prioridades, restricciones) pesan más que cualquier criterio general. Los objetivos del profile (CPA, ROAS, etc.) definen qué es "alto" o "bajo"; si no hay objetivo, compará contra el promedio de la cuenta y decilo explícitamente.

QUÉ BUSCAR en un scan:
- Entidades con gasto relevante y sin resultados, o con costo por resultado muy por encima del objetivo.
- Entidades con buen rendimiento y presupuesto acotado, donde se pueda escalar.
- Inversión mal distribuida respecto del resultado.
- Cruce con CRM (contactos, oportunidades y ventas por canal, campaña o anuncio): priorizá calidad real de ventas sobre costo por lead.
- Diferencias entre plataformas, GA4 y CRM (tracking).
- Problemas de segmentación, estructura o creatividades visibles en los datos.

ANTES DE PAUSAR O BAJAR PRESUPUESTO:
- Verificá volumen suficiente: al menos ${MIN_DAYS_OF_DATA} días de datos y gasto de al menos ${MIN_SPEND_MULTIPLIER_NO_RESULTS} veces el CPA objetivo sin resultados, o una diferencia sostenida contra el objetivo. Con poco volumen, no lo recomiendes.
- Si lastEditedAt indica un cambio en esa entidad dentro de los últimos ${RECENT_EDIT_WINDOW_DAYS} días, no propongas otro cambio sobre ella: recomendá esperar a que termine el reaprendizaje.
- Si el costo por lead es alto pero el CRM muestra buena tasa de cierre o ventas, no recomiendes pausar ni bajar.
- Si el contexto trae una promoción o prioridad que lo contradice, no lo propongas.

HISTORIAL: revisá previousRecommendations para no repetir propuestas publicadas, descartadas o con borrador vigente. Si volvés a proponer algo descartado, solo con evidencia nueva y decilo en la descripción. Si el usuario pide editar una tarjeta, proponé una versión corregida conservando los datos válidos, sin inventar evidencia.

ACLARACIONES: cuando falten datos críticos o una recomendación dependa de una decisión no confirmada, hacé hasta 5 preguntas y devolvé recommendations vacío.

PLATAFORMAS: las válidas para una propuesta son únicamente las de connectedPlatforms. Si no hay conectadas, podés proponer acciones basadas en contexto empresarial con platforms vacío, sin inventar observaciones de medios.

CONTEXTO PERSISTENTE: contextToSave contiene solo fragmentos textuales que aparezcan literalmente en currentUserMessage y sean datos duraderos del negocio. No guardes preguntas, instrucciones generales ni mensajes del asistente.

OPERACIÓN EJECUTABLE: Publicar ejecuta exactamente lo que pongas en operation, sin pasar por otro modelo. Por eso:
- Si la acción principal de la recomendación encaja en una de las operaciones de abajo y la entidad está en entityCatalog, operation es OBLIGATORIA. No la dejes en null para que se prepare al publicar.
- Operaciones:
  - Meta (platform "meta"): pausar/activar campaña, conjunto (adset) o anuncio (kind "set_status", status ACTIVE o PAUSED, entityId).
  - Meta: presupuesto diario de una campaña o conjunto que tenga dailyBudget en el catálogo (kind "set_daily_budget", dailyBudget en unidades de la moneda, no centavos, máximo ±${MAX_BUDGET_CHANGE * 100}% del actual).
  - Meta: rango de edad de uno o más conjuntos (kind "set_age_range", level "adset", ageTargets con id y nombre de cada conjunto, ageMin y ageMax entre 18 y 65; 65 significa 65+). Incluí solo los conjuntos que la recomendación menciona. Para encontrar "los de WhatsApp" u otro destino, usá destinationType y el nombre del catálogo.
  - Google Ads (platform "google_ads", level "campaign"): pausar/activar campaña (status ENABLED o PAUSED) o cambiar su presupuesto diario (máximo ±${MAX_BUDGET_CHANGE * 100}%). customerId es la cuenta de la campaña.
- IDs, estado, nombre y valor actual salen siempre de entityCatalog; nunca de memoria ni deducidos. Para presupuestos, calculá el valor nuevo desde el valor actual del catálogo. Si convendría cambiar más del ${MAX_BUDGET_CHANGE * 100}%, proponé el máximo permitido y aclará que se puede repetir tras medir el resultado.
- Google Ads con budgetShared en true: no propongas cambio de presupuesto (se rechaza). Dejá operation en null y explicá el motivo.
- Una recomendación, una operación. Excepción: set_age_range admite varios conjuntos. Para cambiar varias campañas distintas, hacé una recomendación por cada una, priorizando dentro del máximo.
- Si no encaja (creatividades, tracking, CRM, intereses, ubicaciones, pujas, etc.) o falta una entidad en el catálogo: operation null y completá nonExecutableReason con el motivo concreto (por ejemplo "el catálogo no incluye los conjuntos de WhatsApp"). Nunca inventes IDs. Si operation existe, nonExecutableReason es "".
- El texto y la operación nunca se contradicen. Si editás una tarjeta y cambia la acción (otro rango, otro monto), actualizá operation. En suggestedActions poné primero el cambio que ejecuta Publicar, con valor actual → valor propuesto, y después los pasos manuales de seguimiento.
- Completá con null o vacío los campos que no use el kind: entityId/entityName "" y ageTargets [] cuando no apliquen; status, dailyBudget, ageMin y ageMax null cuando no apliquen; customerId "" para Meta.
- Si el contexto trae validationErrors, corregí solo las recomendaciones indicadas, respetando esos errores.

Toda recomendación es un borrador para revisión humana. No afirmes que se publicó ni que modificaste una plataforma.`

const TOOL_KEYS = ['get_meta_metrics', 'get_google_metrics', 'get_google_analytics_report', 'get_google_tag_manager_report', 'crm_contacts', 'crm_opportunities', 'crm_sales_attribution', 'get_client_memory']
const PLATFORM_DATA_KEYS: Array<[string, RecommendationPlatform, string]> = [
  ['get_meta_metrics', 'meta', 'Meta Ads'],
  ['get_google_metrics', 'google_ads', 'Google Ads'],
  ['get_google_analytics_report', 'ga4', 'Google Analytics'],
  ['get_google_tag_manager_report', 'tag_manager', 'Tag Manager'],
  ['crm_contacts', 'crm', 'CRM · Contactos'],
  ['crm_opportunities', 'crm', 'CRM · Oportunidades'],
  ['crm_sales_attribution', 'crm', 'CRM · Ventas'],
  ['get_client_memory', 'crm', 'Memoria de cliente'],
]
const MAX_SOURCE_CHARS = 1800
const clip = (value: unknown, limit = 320) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
const compactValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return clip(value, 280)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => compactValue(item, depth + 1))
  if (value && typeof value === 'object' && depth < 4) return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 24).map(([key, item]) => [key, compactValue(item, depth + 1)]))
  return undefined
}

async function readPlatformData(client: Record<string, unknown>, user: { id: string; email?: string }, clientId: string, linked: LinkedAccounts) {
  const metaIds = [...linked.meta]
  const googleIds = [...linked.google]
  const platforms: RecommendationPlatform[] = []
  if (metaIds.length) platforms.push('meta')
  if (googleIds.length) platforms.push('google_ads')
  if (client.analytics_property_id) platforms.push('ga4')
  if (client.tag_manager_container_id) platforms.push('tag_manager')
  if (client.crm_type) platforms.push('crm')
  const executionContext: ExecutionContext = { userId: user.id, userEmail: user.email, clientId, metaAccountId: metaIds.join(',') || undefined, googleCustomerId: googleIds.join(',') || undefined, analyticsPropertyId: typeof client.analytics_property_id === 'string' ? client.analytics_property_id : undefined }
  const range = dateRange('Últimos 30 días')
  const definitions = getToolDefinitions(TOOL_KEYS).filter((tool) => {
    if (tool.key === 'get_meta_metrics') return Boolean(executionContext.metaAccountId)
    if (tool.key === 'get_google_metrics') return Boolean(executionContext.googleCustomerId)
    if (tool.key === 'get_google_analytics_report') return Boolean(executionContext.analyticsPropertyId)
    if (tool.key === 'get_google_tag_manager_report') return Boolean(client.tag_manager_container_id)
    if (['crm_contacts', 'crm_opportunities', 'crm_sales_attribution'].includes(tool.key)) return Boolean(client.crm_type)
    return tool.key === 'get_client_memory'
  })
  const byKey = new Map(definitions.map((tool) => [tool.key, tool]))
  const read = async (key: string) => {
    const tool = byKey.get(key) as { execute?: (input: Record<string, string>, context: ExecutionContext) => Promise<unknown> } | undefined
    if (!tool?.execute) return null
    try { return compactValue(await tool.execute(range, executionContext)) } catch (error) { return { available: false, message: error instanceof Error ? clip(error.message, 180) : 'Fuente no disponible' } }
  }
  const data = await Promise.all(PLATFORM_DATA_KEYS.map(async ([key, platform, label]) => ({ key, platform, label, value: await read(key) })))
  return { platforms, data: data.filter((item) => item.value !== null && !(item.value && typeof item.value === 'object' && 'available' in item.value && item.value.available === false)) }
}

type Evaluated = { draft: RecommendationDraft; errors: string[] }

/** Normaliza y valida cada propuesta contra el catálogo real. Nunca deja pasar una operación inválida. */
function evaluate(output: ModelOutput, evidenceById: Map<string, { label: string; excerpt: string }>, connected: RecommendationPlatform[], catalog: EntityCatalog, linked: LinkedAccounts): Evaluated[] {
  return output.recommendations.flatMap((item) => {
    const evidenceIds = [...new Set(item.evidenceIds)].filter((id) => evidenceById.has(id))
    if (!evidenceIds.length) return []
    const operation = normalizeOperation(item.operation, () => true)
    const errors = item.operation && !operation ? ['La operación propuesta no tiene un formato válido para ninguna de las acciones soportadas.'] : operation ? validateOperation(operation, catalog, linked) : []
    const platforms = [...new Set([...item.platforms, ...(operation ? [operation.platform] : [])])].filter((platform) => connected.includes(platform))
    return [{
      errors,
      draft: {
        operation,
        non_executable_reason: operation ? null : item.nonExecutableReason.trim() || MANUAL_REASON,
        title: item.title.trim(), platforms, type: item.type, priority: item.priority,
        description: item.description.trim(), rationale: item.rationale.trim(),
        suggested_actions: item.suggested_actions.map((action) => action.trim()), expected_impact: item.expected_impact.trim(),
        evidence: evidenceIds.map((id) => ({ id, label: evidenceById.get(id)!.label, excerpt: evidenceById.get(id)!.excerpt })),
      },
    }]
  })
}

function finalize(items: Evaluated[]): RecommendationDraft[] {
  return items.map(({ draft, errors }) => {
    if (errors.length || !draft.operation) return { ...draft, operation: null, dedupe_key: null, non_executable_reason: errors.length ? errors.join(' ') : draft.non_executable_reason }
    return { ...draft, non_executable_reason: null, dedupe_key: operationDedupeKey(draft.operation) }
  })
}

export async function runGeneration(input: { supabase: SupabaseClient; user: { id: string; email?: string }; client: Record<string, unknown>; clientId: string; runMode: RunMode; message?: string; editingRecommendationId?: string }) {
  const { supabase, user, client, clientId, runMode } = input
  const message = runMode === 'scan' ? SCAN_MESSAGE : input.message ?? ''
  const { catalog, linkedAccounts } = await buildEntityCatalog(supabase, clientId)
  const [context, previousMessages, allRecommendations, platformData] = await Promise.all([
    getCopilotContext(supabase, clientId, String(client.nombre_del_negocio ?? 'Cliente'), []),
    runMode === 'chat' ? listMessages(supabase, clientId, user.id) : Promise.resolve([]),
    listRecommendations(supabase, clientId),
    readPlatformData(client, user, clientId, linkedAccounts),
  ])
  const connectedPlatforms = platformData.platforms
  let editTarget: Recommendation | null = null
  if (input.editingRecommendationId) {
    editTarget = allRecommendations.find((item) => item.id === input.editingRecommendationId && item.status === 'draft') ?? null
    if (!editTarget) throw new CopilotError('La recomendación a editar ya no está en borrador.', 409)
  }

  const sourceItems = [
    ...(context.profile ? [{ id: 'profile', label: 'Contexto del cliente', excerpt: clip(JSON.stringify(context.profile), MAX_SOURCE_CHARS) }] : []),
    ...context.notes.slice(0, 30).map((note) => ({ id: `context:${note.id}`, label: `Contexto agregado (${note.source})`, excerpt: clip(note.content, 900) })),
    ...context.tasks.map((task) => ({ id: `task:${String(task.id)}`, label: `Tarea · ${clip(task.titulo, 120)}`, excerpt: clip(`${task.estado ?? ''} · ${task.descripcion ?? ''} · prioridad ${task.prioridad ?? 'sin prioridad'}`, MAX_SOURCE_CHARS) })),
    ...context.comments.map((comment) => ({ id: `comment:${String(comment.id)}`, label: `Comentario · ${clip(comment.autor, 80)}`, excerpt: clip(comment.contenido, MAX_SOURCE_CHARS) })),
    ...platformData.data.map((item) => ({ id: `platform:${item.key}`, label: item.label, excerpt: clip(JSON.stringify(item.value), MAX_SOURCE_CHARS) })),
    ...catalogSourceItems(catalog),
    ...allRecommendations.slice(0, 20).map((item) => ({ id: `recommendation:${item.id}`, label: `Historial · ${item.status} · ${clip(item.title, 120)}`, excerpt: clip(`${item.description} ${item.rationale}`, 700) })),
  ]
  const evidenceById = new Map(sourceItems.map((source) => [source.id, source]))
  const modelInput = {
    runMode,
    client: context.clientName,
    connectedPlatforms,
    profile: context.profile,
    storedContext: context.notes.slice(0, 30).map((note) => ({ source: note.source, content: clip(note.content, 900) })),
    tasks: context.tasks.slice(0, 25).map((task) => ({ id: task.id, title: clip(task.titulo, 160), description: clip(task.descripcion, 420), state: task.estado, priority: task.prioridad, dueDate: task.fecha_vencimiento })),
    clientComments: context.comments.slice(0, 25).map((comment) => ({ id: comment.id, author: clip(comment.autor, 80), content: clip(comment.contenido, 420), createdAt: comment.creado_en })),
    platformReadOnlyData: platformData.data,
    entityCatalog: catalog,
    previousRecommendations: allRecommendations.slice(0, 30).map(({ title, status, platforms, type, rationale, expected_impact, operation }) => ({ title: clip(title, 140), status, platforms, type, operation, rationale: clip(rationale, 500), expected_impact: clip(expected_impact, 300) })),
    editingRecommendation: editTarget,
    sourceItems,
    currentUserMessage: message,
  }
  const history = previousMessages.slice(-12).map((item) => ({ role: item.role, content: item.content.slice(0, 2500) }))
  const callModel = async (extra: Record<string, unknown> = {}) => (await generateText({
    model: 'anthropic/claude-sonnet-4.6',
    system: SYSTEM_PROMPT,
    output: Output.object({ schema: modelSchema }),
    prompt: JSON.stringify({ history, context: { ...modelInput, ...extra } }),
  })).output

  let output = await callModel()
  let evaluated = evaluate(output, evidenceById, connectedPlatforms, catalog, linkedAccounts)
  const failing = evaluated.map((item, index) => ({ index, title: item.draft.title, errors: item.errors })).filter((item) => item.errors.length)
  if (failing.length) {
    try {
      const retry = await callModel({ validationErrors: failing.map(({ index, title, errors }) => ({ recommendationIndex: index, title, errors })), previousDraftOutput: output.recommendations })
      output = retry
      evaluated = evaluate(retry, evidenceById, connectedPlatforms, catalog, linkedAccounts)
    } catch (error) {
      console.error('[conexa:copilot] reintento de validación', error instanceof Error ? error.message : error)
    }
  }
  const drafts = finalize(evaluated)

  const runId = randomUUID()
  let createdRecommendations: Recommendation[] = []
  let editedRecommendation: Recommendation | undefined
  if (editTarget && drafts[0] && !output.needsClarification) editedRecommendation = await editRecommendation(supabase, clientId, editTarget.id, drafts[0])
  else if (!editTarget && !output.needsClarification) createdRecommendations = await createRecommendationDrafts(supabase, clientId, user.id, drafts, { source: runMode, runId })

  const contextToSave = runMode === 'scan' ? [] : output.contextToSave.map((item) => item.trim()).filter((item) => item && message.includes(item))
  const skippedDuplicates = !editTarget && !output.needsClarification ? drafts.length - createdRecommendations.length : 0
  return { output, createdRecommendations, editedRecommendation, contextToSave, skippedDuplicates }
}
