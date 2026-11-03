import 'server-only'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import type { CreativeSource, ExecuteAdResult, PlanContext, PlanOverrides, SheetInterpretation } from './types'

// Las tablas se crean con scripts/sql/bulk-sheet-plans.sql, que se corre a mano con autorización.
// En producción cada pedido puede caer en otra instancia, así que un plan en memoria se "pierde" entre
// el armado y la creación. Por eso se guarda en la base salvo que CONEXA_BULK_PLANS_DB=false.
export const persistenceEnabled = () => process.env.CONEXA_BULK_PLANS_DB !== 'false'

type StoredItem = ExecuteAdResult & {
  idempotencyKey: string; planId: string; rowNumber?: number; rowKey?: string; contentHash?: string; createdAt?: string
  reviewStatus?: 'pending' | 'ok' | 'excluded'; reviewNote?: string | null
}
type Memory = {
  interpretations: Map<string, { id: string; headers: string[]; interpretation: SheetInterpretation }>
  aliases: Map<string, Record<string, string>>
  plans: Map<string, { context: PlanContext; overrides: PlanOverrides; status: string }>
  items: Map<string, StoredItem>
  sources: CreativeSource[]
}

const globalMemory = globalThis as unknown as { __conexaBulkMemory?: Memory }
const memory: Memory = globalMemory.__conexaBulkMemory ??= { interpretations: new Map(), aliases: new Map(), plans: new Map(), items: new Map(), sources: [] }

const db = () => createAdminClient()
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export async function findInterpretations(clientId: string) {
  if (!persistenceEnabled()) {
    return [...memory.interpretations.entries()].filter(([key]) => key.startsWith(`${clientId}:`)).map(([key, value]) => ({ id: value.id, headersHash: key.split(':')[1], headers: value.headers, interpretation: value.interpretation }))
  }
  const { data, error } = await db().from('sheet_interpretations').select('id, headers_hash, headers, interpretation').eq('client_id', clientId).order('updated_at', { ascending: false }).limit(20)
  if (error) throw new Error(`No se pudo leer la interpretación guardada: ${error.message}`)
  return (data ?? []).map((row) => ({ id: row.id as string, headersHash: row.headers_hash as string, headers: row.headers as string[], interpretation: row.interpretation as SheetInterpretation }))
}

export async function saveInterpretation(clientId: string, headersHash: string, headers: string[], interpretation: SheetInterpretation, userId: string) {
  if (!persistenceEnabled()) {
    const id = memory.interpretations.get(`${clientId}:${headersHash}`)?.id ?? `mem_${headersHash}`
    memory.interpretations.set(`${clientId}:${headersHash}`, { id, headers, interpretation })
    return id
  }
  const { data, error } = await db().from('sheet_interpretations')
    .upsert({ client_id: clientId, headers_hash: headersHash, headers, interpretation, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'client_id,headers_hash' })
    .select('id').single()
  if (error) throw new Error(`No se pudo guardar la interpretación: ${error.message}`)
  return data.id as string
}

export async function loadAliases(clientId: string): Promise<Record<string, string>> {
  if (!persistenceEnabled()) return memory.aliases.get(clientId) ?? {}
  const { data } = await db().from('account_aliases').select('alias, ad_account_id').eq('client_id', clientId).limit(500)
  return Object.fromEntries((data ?? []).map((row) => [row.alias as string, row.ad_account_id as string]))
}

export async function saveAlias(clientId: string, alias: string, accountId: string, userId: string) {
  if (!persistenceEnabled()) {
    memory.aliases.set(clientId, { ...(memory.aliases.get(clientId) ?? {}), [alias]: accountId })
    return
  }
  await db().from('account_aliases').upsert({ client_id: clientId, alias, ad_account_id: accountId, created_by: userId }, { onConflict: 'client_id,alias' })
}

export async function loadCreativeSources(accountIds: string[]): Promise<CreativeSource[]> {
  if (!accountIds.length) return []
  if (!persistenceEnabled()) return memory.sources.filter((source) => accountIds.includes(source.adAccountId))
  const { data } = await db().from('ad_creative_sources').select('ad_account_id, ad_id, creative_id, drive_file_id, drive_modified_time, format').in('ad_account_id', accountIds).limit(5000)
  return (data ?? []).map((row) => ({ adAccountId: row.ad_account_id, adId: row.ad_id, creativeId: row.creative_id ?? undefined, driveFileId: row.drive_file_id, driveModifiedTime: row.drive_modified_time ?? undefined, format: row.format }))
}

export async function saveCreativeSources(sources: CreativeSource[]) {
  if (!sources.length) return
  if (!persistenceEnabled()) {
    memory.sources.push(...sources)
    return
  }
  await db().from('ad_creative_sources').upsert(sources.map((source) => ({
    ad_account_id: source.adAccountId, ad_id: source.adId, creative_id: source.creativeId ?? null, drive_file_id: source.driveFileId, drive_modified_time: source.driveModifiedTime ?? null, format: source.format,
  })), { onConflict: 'ad_id,drive_file_id' })
}

export async function savePlan(context: PlanContext, interpretationId: string, userId: string) {
  if (!persistenceEnabled()) {
    memory.plans.set(context.planId, { context, overrides: {}, status: 'draft' })
    return context.planId
  }
  const { data, error } = await db().from('bulk_plans').insert({
    client_id: context.clientId, sheet_url: context.sheetUrl, spreadsheet_id: context.spreadsheetId, status: 'draft', context, created_by: userId,
    interpretation_id: isUuid(interpretationId) ? interpretationId : null,
  }).select('id').single()
  if (error) throw new Error(`No se pudo guardar el plan: ${error.message}`)
  return data.id as string
}

export async function loadPlan(planId: string) {
  if (!persistenceEnabled()) return memory.plans.get(planId) ?? null
  if (!isUuid(planId)) return null
  const { data } = await db().from('bulk_plans').select('context, overrides, status').eq('id', planId).maybeSingle()
  return data ? { context: data.context as PlanContext, overrides: data.overrides as PlanOverrides, status: data.status as string } : null
}

export async function savePlanOverrides(planId: string, overrides: PlanOverrides) {
  if (!persistenceEnabled()) {
    const cached = memory.plans.get(planId)
    if (cached) cached.overrides = overrides
    return
  }
  await db().from('bulk_plans').update({ overrides, updated_at: new Date().toISOString() }).eq('id', planId)
}

export async function markPlanApproved(planId: string, userId: string) {
  if (!persistenceEnabled()) {
    const cached = memory.plans.get(planId)
    if (cached) cached.status = 'approved'
    return
  }
  await db().from('bulk_plans').update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() }).eq('id', planId).eq('status', 'draft')
}

export async function findExecutedItem(idempotencyKey: string): Promise<ExecuteAdResult | null> {
  if (!persistenceEnabled()) {
    const cached = memory.items.get(idempotencyKey)
    return cached?.ok ? cached : null
  }
  const { data } = await db().from('bulk_plan_items').select('result').eq('idempotency_key', idempotencyKey).eq('state', 'done').maybeSingle()
  return (data?.result as ExecuteAdResult | undefined) ?? null
}

export async function saveItemResult(planId: string, itemKey: string, rowNumber: number, idempotencyKey: string, payload: unknown, result: ExecuteAdResult) {
  if (!persistenceEnabled()) {
    const meta = payload as { rowKey?: string; contentHash?: string } | null
    memory.items.set(idempotencyKey, { ...result, idempotencyKey, planId, rowNumber, rowKey: meta?.rowKey, contentHash: meta?.contentHash, createdAt: new Date().toISOString() })
    return
  }
  const record = {
  plan_id: planId, item_key: itemKey, row_number: rowNumber, idempotency_key: idempotencyKey, payload, result,
  state: result.ok ? 'done' : 'error', error: result.ok ? null : result.error, updated_at: new Date().toISOString(),
  ...(result.ok ? { meta_campaign_id: result.campaignId, meta_adset_id: result.adsetId, meta_ad_id: result.adId, meta_creative_id: result.creativeId } : {}),
  }
  const answers = (payload as { answers?: unknown } | null)?.answers ?? {}
  const { error } = await db().from('bulk_plan_items').upsert({ ...record, answers }, { onConflict: 'idempotency_key' })
  // Si la columna answers todavía no existe, se guarda igual: las respuestas también viajan dentro de payload.
  if (error) await db().from('bulk_plan_items').upsert(record, { onConflict: 'idempotency_key' })
  }

export type ReviewStatus = 'pending' | 'ok' | 'excluded'
export type ReviewItem = {
  idempotencyKey: string; itemKey: string; rowNumber: number; accountId: string; adId: string
  reviewStatus: ReviewStatus; reviewNote: string | null; createdAt: string
}

export async function listReviewItems(planId: string): Promise<ReviewItem[]> {
  if (!persistenceEnabled()) {
    return [...memory.items.values()].filter((item) => item.planId === planId && item.ok).map((item) => ({
      idempotencyKey: item.idempotencyKey, itemKey: item.itemId, rowNumber: item.rowNumber ?? 0, accountId: item.ok ? item.accountId : '', adId: item.ok ? item.adId : '',
      reviewStatus: item.reviewStatus ?? 'pending', reviewNote: item.reviewNote ?? null, createdAt: item.createdAt ?? new Date().toISOString(),
    }))
  }
  const { data, error } = await db().from('bulk_plan_items')
    .select('idempotency_key, item_key, row_number, meta_ad_id, result, review_status, review_note, updated_at')
    .eq('plan_id', planId).eq('state', 'done').order('row_number').limit(1000)
  if (error) throw new Error(`No se pudo leer la revisión: ${error.message}`)
  return (data ?? []).filter((row) => row.meta_ad_id).map((row) => ({
    idempotencyKey: row.idempotency_key, itemKey: row.item_key, rowNumber: row.row_number, adId: row.meta_ad_id,
    accountId: (row.result as { accountId?: string } | null)?.accountId ?? '',
    reviewStatus: (row.review_status ?? 'pending') as ReviewStatus, reviewNote: row.review_note, createdAt: row.updated_at,
  }))
}

export async function setReviewStatus(planId: string, idempotencyKey: string, status: ReviewStatus, note: string | null, userId: string) {
  if (!persistenceEnabled()) {
    const cached = memory.items.get(idempotencyKey)
    if (cached && cached.planId === planId) Object.assign(cached, { reviewStatus: status, reviewNote: note })
    return
  }
  const { error } = await db().from('bulk_plan_items')
    .update({ review_status: status, review_note: note, reviewed_at: status === 'pending' ? null : new Date().toISOString(), reviewed_by: status === 'pending' ? null : userId })
    .eq('plan_id', planId).eq('idempotency_key', idempotencyKey)
  if (error) throw new Error(`No se pudo guardar la revisión: ${error.message}`)
}

// Filas creadas en lotes anteriores del mismo sheet, por clave de fila (sheet + número de fila) con su hash de contenido.
export type PreviousRow = { planId: string; rowKey: string; contentHash: string; createdAt: string }
export async function findPreviousRows(spreadsheetId: string, rowKeys: string[]): Promise<PreviousRow[]> {
  if (!rowKeys.length) return []
  if (!persistenceEnabled()) {
    return [...memory.items.values()].filter((item) => item.ok && item.rowKey && rowKeys.includes(item.rowKey)).map((item) => ({
      planId: item.planId, rowKey: item.rowKey!, contentHash: item.contentHash ?? '', createdAt: item.createdAt ?? new Date().toISOString(),
    }))
  }
  const results: PreviousRow[] = []
  for (let index = 0; index < rowKeys.length; index += 200) {
    const { data } = await db().from('bulk_plan_items')
      .select('plan_id, payload, updated_at')
      .eq('state', 'done')
      .in('payload->>rowKey', rowKeys.slice(index, index + 200))
      .limit(2000)
    for (const row of data ?? []) {
      const payload = row.payload as { rowKey?: string; contentHash?: string } | null
      if (payload?.rowKey) results.push({ planId: row.plan_id, rowKey: payload.rowKey, contentHash: payload.contentHash ?? '', createdAt: row.updated_at })
    }
  }
  return results.filter((row) => row.planId && row.rowKey.startsWith(`${spreadsheetId}:`))
}

export async function listItemResults(planId: string): Promise<ExecuteAdResult[]> {
  if (!persistenceEnabled()) return [...memory.items.values()].filter((item) => item.planId === planId)
  const { data } = await db().from('bulk_plan_items').select('result').eq('plan_id', planId).limit(1000)
  return (data ?? []).map((row) => row.result as ExecuteAdResult).filter(Boolean)
}
