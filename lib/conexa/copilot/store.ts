import type { SupabaseClient } from '@supabase/supabase-js'
import { CopilotError } from './route-helpers'
import { executeOperation } from './executors'
import type { ClientContextRecord, CopilotChatMessage, CopilotContext, ExecutionResult, Recommendation, RecommendationDraft, RecommendationStatus } from './types'

const REC_TABLE = 'conexa_copilot_recommendations'
const CONTEXT_TABLE = 'conexa_copilot_context'
const MESSAGE_TABLE = 'conexa_copilot_chat_messages'
const TABLE_ERROR = 'No se pudieron leer las tablas de Recomendaciones. Aplicá el SQL del módulo en el proyecto Supabase conectado a esta aplicación.'

export async function assertClientAccess(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase.from('clientes').select('id, nombre_del_negocio, meta_ads_account_id, meta_ads_account_ids, google_ads_customer_id, google_ads_customer_ids, analytics_property_id, tag_manager_container_id, crm_type').eq('id', clientId).maybeSingle()
  if (error) throw new CopilotError('No se pudo validar el cliente seleccionado.', 500)
  if (!data) throw new CopilotError('El cliente no existe o tu usuario no tiene acceso.', 404)
  return data
}

function dbError(error: { code?: string; message?: string } | null): never {
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703') throw new CopilotError(TABLE_ERROR, 503)
  throw new CopilotError(TABLE_ERROR, 500)
}

export async function listRecommendations(supabase: SupabaseClient, clientId: string, status?: RecommendationStatus) {
  let query = supabase.from(REC_TABLE).select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(200)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) dbError(error)
  const rows = (data ?? []) as unknown as Recommendation[]
  const authorIds = [...new Set(rows.flatMap((item) => [item.published_by, item.discarded_by]).filter((id): id is string => Boolean(id)))]
  if (!authorIds.length) return rows
  const { data: authors } = await supabase.from('colaboradores').select('id, nombre, apellido').in('id', authorIds)
  const authorNames = new Map((authors ?? []).map((author) => [author.id, [author.nombre, author.apellido].filter(Boolean).join(' ')]))
  return rows.map((item) => ({ ...item, published_by_name: item.published_by ? authorNames.get(item.published_by) ?? null : null, discarded_by_name: item.discarded_by ? authorNames.get(item.discarded_by) ?? null : null }))
}

export async function listMessages(supabase: SupabaseClient, clientId: string, userId: string) {
  const { data, error } = await supabase.from(MESSAGE_TABLE).select('*').eq('client_id', clientId).eq('user_id', userId).order('created_at', { ascending: false }).limit(60)
  if (error) dbError(error)
  return ((data ?? []) as unknown as CopilotChatMessage[]).reverse()
}

export async function insertMessages(supabase: SupabaseClient, messages: Array<Omit<CopilotChatMessage, 'id' | 'created_at'>>) {
  if (!messages.length) return []
  const { data, error } = await supabase.from(MESSAGE_TABLE).insert(messages).select('*')
  if (error) dbError(error)
  return (data ?? []) as unknown as CopilotChatMessage[]
}

export async function addClientContext(supabase: SupabaseClient, input: { clientId: string; content: string; source: 'chat' | 'manual'; userId: string }) {
  const { data, error } = await supabase.from(CONTEXT_TABLE).insert({ client_id: input.clientId, content: input.content, source: input.source, created_by: input.userId }).select('*').single()
  if (error) dbError(error)
  return data as unknown as ClientContextRecord
}

export async function listClientContext(supabase: SupabaseClient, clientId: string) {
  const { data, error } = await supabase.from(CONTEXT_TABLE).select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100)
  if (error) dbError(error)
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

export async function createRecommendationDrafts(supabase: SupabaseClient, clientId: string, createdBy: string, drafts: RecommendationDraft[]) {
  if (!drafts.length) return []
  const rows = drafts.map((draft) => ({ ...draft, client_id: clientId, status: 'draft', discard_reason: null, created_by: createdBy, payload: {} }))
  const { data, error } = await supabase.from(REC_TABLE).insert(rows).select('*')
  if (error) dbError(error)
  return (data ?? []) as unknown as Recommendation[]
}

export async function editRecommendation(supabase: SupabaseClient, clientId: string, id: string, patch: RecommendationDraft) {
  const { data, error } = await supabase.from(REC_TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).eq('client_id', clientId).eq('status', 'draft').select('*').maybeSingle()
  if (error) dbError(error)
  if (!data) throw new CopilotError('La recomendación ya no está en borrador o no pertenece a este cliente.', 409)
  return data as unknown as Recommendation
}

export async function publishRecommendation(supabase: SupabaseClient, clientId: string, id: string, userId: string) {
  const { data: claimed, error: claimError } = await supabase.from(REC_TABLE).update({ status: 'executing', execution_error: null }).eq('id', id).eq('client_id', clientId).eq('status', 'draft').not('operation', 'is', null).select('*').maybeSingle()
  if (claimError) dbError(claimError)
  if (!claimed) throw new CopilotError('La recomendación ya no está en borrador, no pertenece a este cliente o no tiene una acción ejecutable en plataforma.', 409)
  const recommendation = claimed as unknown as Recommendation

  let result: ExecutionResult
  try {
    result = await executeOperation(supabase, clientId, recommendation.operation!)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'La plataforma no pudo aplicar el cambio.'
    await supabase.from(REC_TABLE).update({ status: 'draft', execution_error: message.slice(0, 1000) }).eq('id', id).eq('status', 'executing')
    throw error instanceof CopilotError ? error : new CopilotError(message, 502)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase.from(REC_TABLE).update({ status: 'published', published_by: userId, published_at: now, execution_result: result, execution_error: null }).eq('id', id).eq('status', 'executing').select('*').maybeSingle()
  if (error || !data) throw new CopilotError(`El cambio se aplicó en ${result.platform === 'meta' ? 'Meta Ads' : 'Google Ads'} (${result.before} → ${result.after}), pero no se pudo registrar en el histórico. No lo vuelvas a publicar; revisá la plataforma.`, 500)
  return data as unknown as Recommendation
}

export async function discardRecommendation(supabase: SupabaseClient, clientId: string, id: string, userId: string, reason: string | null) {
  const now = new Date().toISOString()
  const { data, error } = await supabase.from(REC_TABLE).update({ status: 'discarded', discard_reason: reason, discarded_by: userId, discarded_at: now, updated_at: now }).eq('id', id).eq('client_id', clientId).eq('status', 'draft').select('*').maybeSingle()
  if (error) dbError(error)
  if (!data) throw new CopilotError('La recomendación ya no está en borrador o no pertenece a este cliente.', 409)
  return data as unknown as Recommendation
}

export async function restoreRecommendation(supabase: SupabaseClient, clientId: string, id: string) {
  const now = new Date().toISOString()
  const { data, error } = await supabase.from(REC_TABLE).update({ status: 'draft', discard_reason: null, discarded_by: null, discarded_at: null, updated_at: now }).eq('id', id).eq('client_id', clientId).eq('status', 'discarded').select('*').maybeSingle()
  if (error) dbError(error)
  if (!data) throw new CopilotError('Solo se pueden restaurar recomendaciones descartadas del cliente seleccionado.', 409)
  return data as unknown as Recommendation
}
