import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { STUCK_EXECUTION_MINUTES } from './config'
import { CopilotError } from './route-helpers'
import { buildPlan, executePlan } from './executors'
import { prepareOperation } from './operations'
import type { ClientContextRecord, CopilotChatMessage, CopilotContext, DecisionRecord, ExecutionPlan, ExecutionResult, PlanStepResult, Recommendation, RecommendationDraft, RecommendationOperation, RecommendationSource, RecommendationStatus } from './types'

const REC_TABLE = 'conexa_copilot_recommendations'
const DECISION_TABLE = 'conexa_copilot_decisions'
const CONTEXT_TABLE = 'conexa_copilot_context'
const MESSAGE_TABLE = 'conexa_copilot_chat_messages'
const TABLE_ERROR = 'No se pudieron leer las tablas de Recomendaciones. Aplicá el SQL del módulo en el proyecto Supabase conectado a esta aplicación.'

export async function assertClientAccess(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase.from('clientes').select('id, nombre_del_negocio, meta_ads_account_id, meta_ads_account_ids, google_ads_customer_id, google_ads_customer_ids, analytics_property_id, tag_manager_container_id, crm_type').eq('id', clientId).maybeSingle()
  if (error) throw new CopilotError('No se pudo validar el cliente seleccionado.', 500)
  if (!data) throw new CopilotError('El cliente no existe o tu usuario no tiene acceso.', 404)
  return data
}

type SupabaseErrorLike = { code?: string; message?: string; details?: string | null; hint?: string | null } | null
/** Describe la consulta sin valores: tabla, operación, columnas y filtros. */
type QueryInfo = { table: string; op: 'select' | 'insert' | 'update'; columns: string; filters: string }

const SCHEMA_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])
const isPermissionError = (error: SupabaseErrorLike) => error?.code === '42501' || /row-level security|permission denied/i.test(error?.message ?? '')

export function logDbError(error: SupabaseErrorLike, query: QueryInfo) {
  console.error('[conexa:copilot:db]', JSON.stringify({ ...query, code: error?.code ?? null, message: error?.message ?? null, details: error?.details ?? null, hint: error?.hint ?? null }))
}

function dbError(error: SupabaseErrorLike, query: QueryInfo): never {
  logDbError(error, query)
  if (SCHEMA_CODES.has(error?.code ?? '')) throw new CopilotError(TABLE_ERROR, 503)
  if (isPermissionError(error)) throw new CopilotError('Sin permisos para leer las tablas de Recomendaciones.', 403)
  throw new CopilotError(`Error al leer Recomendaciones (código ${error?.code ?? 'desconocido'}).`, 500)
}

export async function listRecommendations(supabase: SupabaseClient, clientId: string, status?: RecommendationStatus) {
  let query = supabase.from(REC_TABLE).select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(200)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) dbError(error, { table: REC_TABLE, op: 'select', columns: '*', filters: `client_id=eq${status ? ', status=eq' : ''}, order created_at desc, limit 200` })
  const rows = (data ?? []) as unknown as Recommendation[]
  const publishedIds = rows.filter((item) => item.status === 'published').map((item) => item.id)
  let decisions: DecisionRecord[] = []
  if (publishedIds.length) {
    const { data: decisionRows, error: decisionError } = await supabase.from(DECISION_TABLE).select('id, recommendation_id, user_id, action, platform, entity_type, entity_id, value_before, value_after, outcome, created_at, payload').in('recommendation_id', publishedIds.slice(0, 200)).order('created_at', { ascending: true })
    if (decisionError) logDbError(decisionError, { table: DECISION_TABLE, op: 'select', columns: 'id, recommendation_id, user_id, action, platform, entity_type, entity_id, value_before, value_after, outcome, created_at, payload', filters: 'recommendation_id=in, order created_at asc' })
    else decisions = (decisionRows ?? []) as unknown as DecisionRecord[]
  }
  const authorIds = [...new Set([...rows.flatMap((item) => [item.published_by, item.discarded_by]), ...decisions.map((item) => item.user_id)].filter((id): id is string => Boolean(id)))]
  const { data: authors } = authorIds.length ? await supabase.from('colaboradores').select('id, nombre, apellido').in('id', authorIds) : { data: [] }
  const authorNames = new Map((authors ?? []).map((author) => [author.id, [author.nombre, author.apellido].filter(Boolean).join(' ')]))
  const decisionsByRecommendation = new Map<string, DecisionRecord[]>()
  for (const decision of decisions) {
    if (!decision.recommendation_id) continue
    const list = decisionsByRecommendation.get(decision.recommendation_id) ?? []
    list.push({ ...decision, user_name: decision.user_id ? authorNames.get(decision.user_id) ?? null : null })
    decisionsByRecommendation.set(decision.recommendation_id, list)
  }
  return rows.map((item) => ({ ...item, decisions: decisionsByRecommendation.get(item.id) ?? [], published_by_name: item.published_by ? authorNames.get(item.published_by) ?? null : null, discarded_by_name: item.discarded_by ? authorNames.get(item.discarded_by) ?? null : null }))
}

export async function listMessages(supabase: SupabaseClient, clientId: string, userId: string) {
  const { data, error } = await supabase.from(MESSAGE_TABLE).select('*').eq('client_id', clientId).eq('user_id', userId).order('created_at', { ascending: false }).limit(60)
  if (error) dbError(error, { table: MESSAGE_TABLE, op: 'select', columns: '*', filters: 'client_id=eq, user_id=eq, order created_at desc, limit 60' })
  return ((data ?? []) as unknown as CopilotChatMessage[]).reverse()
}

export async function insertMessages(supabase: SupabaseClient, messages: Array<Omit<CopilotChatMessage, 'id' | 'created_at'>>) {
  if (!messages.length) return []
  const { data, error } = await supabase.from(MESSAGE_TABLE).insert(messages).select('*')
  if (error) dbError(error, { table: MESSAGE_TABLE, op: 'insert', columns: 'client_id, user_id, role, content', filters: 'returning *' })
  return (data ?? []) as unknown as CopilotChatMessage[]
}

export async function addClientContext(supabase: SupabaseClient, input: { clientId: string; content: string; source: 'chat' | 'manual'; userId: string }) {
  const { data, error } = await supabase.from(CONTEXT_TABLE).insert({ client_id: input.clientId, content: input.content, source: input.source, created_by: input.userId }).select('*').single()
  if (error) dbError(error, { table: CONTEXT_TABLE, op: 'insert', columns: 'client_id, content, source, created_by', filters: 'returning *' })
  return data as unknown as ClientContextRecord
}

export async function listClientContext(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase.from(CONTEXT_TABLE).select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100)
  if (error) dbError(error, { table: CONTEXT_TABLE, op: 'select', columns: '*', filters: 'client_id=eq, order created_at desc, limit 100' })
  return (data ?? []) as unknown as ClientContextRecord[]
}

export async function getCopilotContext(supabase: SupabaseClient, clientId: string, clientName: string, platforms: CopilotContext['platforms']) {
  const [{ data: profile }, { data: tasks }, { data: comments }, notes] = await Promise.all([
    supabase.from('ai_client_profile').select('industry, commercial_objective, product_type, primary_conversion_type, target_monthly_sales, target_cpl, additional_context').eq('client_id', clientId).maybeSingle(),
    supabase.from('tareas').select('id, titulo, descripcion, estado, prioridad, fecha_vencimiento').or(`cliente_id.eq.${clientId},cliente_ids.cs.{${clientId}}`).order('updated_at', { ascending: false }).limit(40),
    supabase.from('comentarios_clientes').select('id, contenido, autor, creado_en').eq('cliente_id', clientId).order('creado_en', { ascending: false }).limit(40),
    listClientContext(supabase, clientId),
  ])
  return { clientName, profile: profile as Record<string, unknown> | null, tasks: (tasks ?? []) as Array<Record<string, unknown>>, comments: (comments ?? []) as Array<Record<string, unknown>>, notes, platforms }
}

const UNIQUE_VIOLATION = '23505'

/** Inserta fila por fila: si una choca con el índice único (ya hay un borrador vigente con la misma acción) se omite sin cortar la corrida. */
export async function createRecommendationDrafts(supabase: SupabaseClient, clientId: string, createdBy: string, drafts: RecommendationDraft[], options: { source: RecommendationSource; runId: string }) {
  const created: Recommendation[] = []
  for (const draft of drafts) {
    const row = { ...draft, operation: draft.operation ?? null, non_executable_reason: draft.non_executable_reason ?? null, dedupe_key: draft.dedupe_key ?? null, client_id: clientId, status: 'draft', discard_reason: null, created_by: createdBy, payload: {}, source: options.source, run_id: options.runId }
    const { data, error } = await supabase.from(REC_TABLE).insert(row).select('*').single()
    if (error?.code === UNIQUE_VIOLATION) continue
    if (error) dbError(error, { table: REC_TABLE, op: 'insert', columns: Object.keys(row).join(', '), filters: `source=${options.source}, status=draft, returning *` })
    created.push(data as unknown as Recommendation)
  }
  return created
}

/** Si el patch trae operation (aunque sea null) se reemplaza junto con su motivo y clave; si no la trae, la acción queda como estaba. */
export async function editRecommendation(supabase: SupabaseClient, clientId: string, id: string, patch: RecommendationDraft) {
  const update: Record<string, unknown> = { ...patch, execution_error: null, updated_at: new Date().toISOString() }
  if ('operation' in patch) {
    update.operation = patch.operation ?? null
    update.dedupe_key = patch.operation ? patch.dedupe_key ?? null : null
    update.non_executable_reason = patch.operation ? null : patch.non_executable_reason ?? null
  } else {
    delete update.dedupe_key
    delete update.non_executable_reason
  }
  const { data, error } = await supabase.from(REC_TABLE).update(update).eq('id', id).eq('client_id', clientId).eq('status', 'draft').select('*').maybeSingle()
  if (error?.code === UNIQUE_VIOLATION) throw new CopilotError('Ya hay otro borrador vigente con exactamente la misma acción. Editá ese o descartalo primero.', 409)
  if (error) dbError(error, { table: REC_TABLE, op: 'update', columns: Object.keys(update).join(', '), filters: 'id=eq, client_id=eq, status=eq.draft, returning *' })
  if (!data) throw new CopilotError('La recomendación ya no está en borrador o no pertenece a este cliente.', 409)
  return data as unknown as Recommendation
}

export async function getDraft(supabase: SupabaseClient, clientId: string, id: string) {
  const { data, error } = await supabase.from(REC_TABLE).select('*').eq('id', id).eq('client_id', clientId).maybeSingle()
  if (error) dbError(error, { table: REC_TABLE, op: 'select', columns: '*', filters: 'id=eq, client_id=eq' })
  const recommendation = data as unknown as Recommendation | null
  if (!recommendation || recommendation.status !== 'draft') throw new CopilotError('La recomendación ya no está en borrador o no pertenece a este cliente.', 409)
  return recommendation
}

export async function prepareRecommendationOperation(supabase: SupabaseClient, clientId: string, id: string) {
  const { data: current, error: readError } = await supabase.from(REC_TABLE).select('*').eq('id', id).eq('client_id', clientId).maybeSingle()
  if (readError) dbError(readError, { table: REC_TABLE, op: 'select', columns: '*', filters: 'id=eq, client_id=eq' })
  const recommendation = current as unknown as Recommendation | null
  if (!recommendation || recommendation.status !== 'draft') throw new CopilotError('La recomendación ya no está en borrador o no pertenece a este cliente.', 409)
  if (recommendation.operation) return recommendation
  const operation = await prepareOperation(supabase, clientId, recommendation)
  const { data, error } = await supabase.from(REC_TABLE).update({ operation, execution_error: null }).eq('id', id).eq('client_id', clientId).eq('status', 'draft').select('*').maybeSingle()
  if (error) dbError(error, { table: REC_TABLE, op: 'update', columns: 'operation, execution_error', filters: 'id=eq, client_id=eq, status=eq.draft, returning *' })
  if (!data) throw new CopilotError('La recomendación cambió mientras se preparaba la acción. Actualizá la vista.', 409)
  return data as unknown as Recommendation
}

const operationSchema = z.discriminatedUnion('kind', [
  z.object({ platform: z.literal('meta'), kind: z.literal('set_status'), level: z.enum(['campaign', 'adset', 'ad']), entityId: z.string().regex(/^\d{3,30}$/), entityName: z.string().max(200), status: z.enum(['ACTIVE', 'PAUSED']) }),
  z.object({ platform: z.literal('meta'), kind: z.literal('set_age_range'), adsets: z.array(z.object({ id: z.string().regex(/^\d{3,30}$/), name: z.string().max(200) })).min(1).max(10), ageMin: z.number().int().min(18).max(65), ageMax: z.number().int().min(18).max(65) }),
  z.object({ platform: z.literal('meta'), kind: z.literal('set_daily_budget'), level: z.enum(['campaign', 'adset']), entityId: z.string().regex(/^\d{3,30}$/), entityName: z.string().max(200), dailyBudget: z.number().positive() }),
])
const googleOperationSchema = z.discriminatedUnion('kind', [
  z.object({ platform: z.literal('google_ads'), kind: z.literal('set_status'), customerId: z.string().regex(/^\d{3,20}$/), campaignId: z.string().regex(/^\d{1,30}$/), entityName: z.string().max(200), status: z.enum(['ENABLED', 'PAUSED']) }),
  z.object({ platform: z.literal('google_ads'), kind: z.literal('set_daily_budget'), customerId: z.string().regex(/^\d{3,20}$/), campaignId: z.string().regex(/^\d{1,30}$/), entityName: z.string().max(200), dailyBudget: z.number().positive() }),
])

/** Valida la forma de una operación guardada antes de ejecutarla. */
export function parseOperation(value: unknown): RecommendationOperation {
  const platform = value && typeof value === 'object' ? (value as { platform?: unknown }).platform : null
  const parsed = platform === 'google_ads' ? googleOperationSchema.safeParse(value) : operationSchema.safeParse(value)
  if (!parsed.success) throw new CopilotError('La acción guardada en esta recomendación no tiene un formato válido. Editala antes de publicar.', 422)
  return parsed.data as RecommendationOperation
}

async function releaseStuckExecution(supabase: SupabaseClient, clientId: string, id: string) {
  const cutoff = new Date(Date.now() - STUCK_EXECUTION_MINUTES * 60_000).toISOString()
  await supabase.from(REC_TABLE).update({ status: 'draft', execution_error: 'La ejecución anterior quedó interrumpida. Revisá la plataforma antes de volver a publicar.' }).eq('id', id).eq('client_id', clientId).eq('status', 'executing').lt('executing_at', cutoff)
}

/** Paso 1 de Publicar: arma el plan con los valores actuales de la plataforma, sin efectos secundarios en la plataforma. */
export async function previewPublish(supabase: SupabaseClient, clientId: string, id: string): Promise<{ recommendation: Recommendation; plan: ExecutionPlan }> {
  await releaseStuckExecution(supabase, clientId, id)
  let recommendation = await getDraft(supabase, clientId, id)
  if (!recommendation.operation) {
    if (recommendation.non_executable_reason) throw new CopilotError(`Esta recomendación no se ejecuta en plataforma: ${recommendation.non_executable_reason} Usá «Marcar como hecha» cuando la apliques.`, 422)
    recommendation = await prepareRecommendationOperation(supabase, clientId, id)
  }
  const { plan } = await buildPlan(supabase, clientId, parseOperation(recommendation.operation))
  return { recommendation, plan }
}

function decisionRow(recommendation: Recommendation, userId: string, item: PlanStepResult, hash: string) {
  return {
    recommendation_id: recommendation.id, client_id: recommendation.client_id, user_id: userId, action: 'publish',
    platform: item.platform, account_id: item.accountId, entity_type: item.entityType, entity_id: item.entityId,
    value_before: { value: item.before, label: item.beforeLabel }, value_after: { value: item.after, label: item.afterLabel },
    outcome: item.outcome === 'failed' ? 'failed' : 'success', plan_hash: hash,
    payload: { step: item },
  }
}

async function recordDecisions(supabase: SupabaseClient, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return
  const { error } = await supabase.from(DECISION_TABLE).insert(rows)
  if (error) logDbError(error, { table: DECISION_TABLE, op: 'insert', columns: [...new Set(rows.flatMap((row) => Object.keys(row)))].join(', '), filters: `${rows.length} fila(s)` })
}

/** Paso 2 de Publicar: toma el candado, verifica que el plan no cambió y ejecuta cada paso con código determinista. */
export async function confirmPublish(supabase: SupabaseClient, clientId: string, id: string, userId: string, confirmedPlanHash: string) {
  await releaseStuckExecution(supabase, clientId, id)
  const { data: claimed, error: claimError } = await supabase.from(REC_TABLE).update({ status: 'executing', executing_at: new Date().toISOString(), execution_error: null }).eq('id', id).eq('client_id', clientId).eq('status', 'draft').not('operation', 'is', null).select('*').maybeSingle()
  if (claimError) dbError(claimError, { table: REC_TABLE, op: 'update', columns: 'status, executing_at, execution_error', filters: 'id=eq, client_id=eq, status=eq.draft, operation=not.is.null, returning *' })
  if (!claimed) throw new CopilotError('La recomendación ya se está ejecutando, ya no está en borrador o no tiene una acción ejecutable.', 409)
  const recommendation = claimed as unknown as Recommendation
  const backToDraft = (patch: Record<string, unknown>) => supabase.from(REC_TABLE).update({ status: 'draft', executing_at: null, ...patch }).eq('id', id).eq('status', 'executing')

  let built: Awaited<ReturnType<typeof buildPlan>>
  try {
    built = await buildPlan(supabase, clientId, parseOperation(recommendation.operation))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo leer el estado actual en la plataforma.'
    await backToDraft({ execution_error: message.slice(0, 1000) })
    throw error instanceof CopilotError ? error : new CopilotError(message, 502)
  }
  if (built.plan.hash !== confirmedPlanHash) {
    await backToDraft({})
    throw new CopilotError('Los valores cambiaron desde la vista previa. Revisá el plan actualizado y confirmá de nuevo.', 409)
  }

  const results = await executePlan(built.internal)
  await recordDecisions(supabase, results.filter((item) => item.outcome !== 'skipped').map((item) => decisionRow(recommendation, userId, item, built.plan.hash)))
  const executionResult: ExecutionResult = { steps: results, planHash: built.plan.hash, executedAt: new Date().toISOString() }
  const failed = results.filter((item) => item.outcome === 'failed')

  if (failed.length) {
    const applied = results.filter((item) => item.outcome === 'success').map((item) => `«${item.entityName}»`)
    const message = `${failed.map((item) => `«${item.entityName}»: ${item.error}`).join(' ')}${applied.length ? ` Se aplicó en ${applied.join(', ')}; al volver a publicar esos pasos se omiten.` : ''}`
    await backToDraft({ execution_error: message.slice(0, 1000), execution_result: executionResult })
    throw new CopilotError(`No se pudo aplicar todo el cambio. ${message}`, 502)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase.from(REC_TABLE).update({ status: 'published', published_by: userId, published_at: now, executing_at: null, execution_result: executionResult, execution_error: null }).eq('id', id).eq('status', 'executing').select('*').maybeSingle()
  if (error) logDbError(error, { table: REC_TABLE, op: 'update', columns: 'status, published_by, published_at, executing_at, execution_result, execution_error', filters: 'id=eq, status=eq.executing, returning *' })
  if (error || !data) throw new CopilotError('El cambio se aplicó en la plataforma, pero no se pudo registrar en el histórico. No lo vuelvas a publicar; revisá la plataforma.', 500)
  return data as unknown as Recommendation
}

export async function markManualDone(supabase: SupabaseClient, clientId: string, id: string, userId: string) {
  const now = new Date().toISOString()
  const { data, error } = await supabase.from(REC_TABLE).update({ status: 'published', published_by: userId, published_at: now, updated_at: now, execution_result: { manual: true, executedAt: now }, execution_error: null }).eq('id', id).eq('client_id', clientId).eq('status', 'draft').is('operation', null).select('*').maybeSingle()
  if (error) dbError(error, { table: REC_TABLE, op: 'update', columns: 'status, published_by, published_at, updated_at, execution_result, execution_error', filters: 'id=eq, client_id=eq, status=eq.draft, operation=is.null, returning *' })
  if (!data) throw new CopilotError('Solo se pueden marcar como hechas las recomendaciones en borrador sin acción ejecutable.', 409)
  const recommendation = data as unknown as Recommendation
  const platform = recommendation.platforms.find((item) => item === 'meta' || item === 'google_ads') ?? null
  await recordDecisions(supabase, [{ recommendation_id: id, client_id: clientId, user_id: userId, action: 'manual_done', platform, outcome: 'success', payload: { manual: true, title: recommendation.title } }])
  return recommendation
}

export async function discardRecommendation(supabase: SupabaseClient, clientId: string, id: string, userId: string, reason: string | null) {
  const now = new Date().toISOString()
  const { data, error } = await supabase.from(REC_TABLE).update({ status: 'discarded', discard_reason: reason, discarded_by: userId, discarded_at: now, updated_at: now }).eq('id', id).eq('client_id', clientId).eq('status', 'draft').select('*').maybeSingle()
  if (error) dbError(error, { table: REC_TABLE, op: 'update', columns: 'status, discard_reason, discarded_by, discarded_at, updated_at', filters: 'id=eq, client_id=eq, status=eq.draft, returning *' })
  if (!data) throw new CopilotError('La recomendación ya no está en borrador o no pertenece a este cliente.', 409)
  return data as unknown as Recommendation
}

export async function restoreRecommendation(supabase: SupabaseClient, clientId: string, id: string) {
  const now = new Date().toISOString()
  const { data, error } = await supabase.from(REC_TABLE).update({ status: 'draft', discard_reason: null, discarded_by: null, discarded_at: null, updated_at: now }).eq('id', id).eq('client_id', clientId).eq('status', 'discarded').select('*').maybeSingle()
  if (error) dbError(error, { table: REC_TABLE, op: 'update', columns: 'status, discard_reason, discarded_by, discarded_at, updated_at', filters: 'id=eq, client_id=eq, status=eq.discarded, returning *' })
  if (!data) throw new CopilotError('Solo se pueden restaurar recomendaciones descartadas del cliente seleccionado.', 409)
  return data as unknown as Recommendation
}
