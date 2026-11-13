import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMetaAccessToken, META_GRAPH_VERSION } from '@/lib/meta-ads/token'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'
import { MAX_BUDGET_CHANGE, RECENT_EDIT_WINDOW_DAYS } from './config'
import { CopilotError } from './route-helpers'
import type { ExecutionPlan, PlanStep, PlanStepResult, RecommendationOperation } from './types'

const GOOGLE_ADS_API_VERSION = 'v23'
export const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])
const splitIds = (value: unknown) => String(value ?? '').split(',').map((id) => id.trim()).filter(Boolean)

/** Factor entre unidades de la moneda y las unidades mínimas que usa Meta (centavos, salvo monedas sin decimales). */
export const metaCurrencyFactor = (currency: string) => (ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100)
export const GOOGLE_MICROS = 1_000_000

export async function getClientAdAccounts(supabase: SupabaseClient, clientId: string) {
  const [{ data: client, error: clientError }, { data: accounts, error: accountError }] = await Promise.all([
    supabase.from('clientes').select('meta_ads_account_id, meta_ads_account_ids, google_ads_customer_id, google_ads_customer_ids').eq('id', clientId).maybeSingle(),
    supabase.from('cuentas_publicitarias').select('id_cuenta, plataforma').eq('cliente_id', clientId).eq('activo', true),
  ])
  if (clientError || accountError || !client) throw new CopilotError('No se pudieron validar las cuentas publicitarias del cliente.', 500)
  const rows = accounts ?? []
  const arrayIds = (value: unknown) => (Array.isArray(value) ? value.flatMap(splitIds) : [])
  const meta = new Set([...rows.filter((row) => row.plataforma === 'meta').flatMap((row) => splitIds(row.id_cuenta)), ...arrayIds(client.meta_ads_account_ids), ...splitIds(client.meta_ads_account_id)].map((id) => id.replace(/^act_/, '')))
  const google = new Set([...rows.filter((row) => row.plataforma === 'google').flatMap((row) => splitIds(row.id_cuenta)), ...arrayIds(client.google_ads_customer_ids), ...splitIds(client.google_ads_customer_id)].map((id) => id.replace(/-/g, '')))
  return { meta, google }
}

export function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2 }).format(amount) } catch { return `${amount} ${currency}` }
}

export const budgetChange = (current: number, next: number) => (current > 0 ? (next - current) / current : null)

function assertBudgetChange(name: string, current: number, next: number, currency: string) {
  if (!Number.isFinite(next) || next <= 0) throw new CopilotError(`El presupuesto propuesto para «${name}» no es válido.`, 422)
  if (current <= 0) throw new CopilotError(`«${name}» no tiene un presupuesto diario propio para modificar.`, 422)
  const change = budgetChange(current, next)!
  if (Math.abs(change) > MAX_BUDGET_CHANGE + 1e-9) throw new CopilotError(`El cambio de presupuesto de «${name}» (${money(current, currency)} → ${money(next, currency)}, ${Math.round(change * 100)}%) supera el límite de ±${MAX_BUDGET_CHANGE * 100}% sobre el valor actual.`, 422)
}

export async function metaRequest<T>(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const token = await getMetaAccessToken()
  if (!token) throw new CopilotError('No hay una conexión activa de Meta Ads.', 409)
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`)
  const init: RequestInit = { method, cache: 'no-store' }
  if (method === 'GET') for (const [key, value] of Object.entries({ ...params, access_token: token })) url.searchParams.set(key, value)
  else { init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; init.body = new URLSearchParams({ ...params, access_token: token }) }
  const response = await fetch(url, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) throw new CopilotError(`Meta Ads rechazó la operación: ${data.error?.error_user_msg ?? data.error?.message ?? response.status}`, 502)
  return data as T
}

export async function googleRequest<T>(path: string, body: unknown): Promise<T> {
  const { accessToken, error } = await getGoogleAdsAccessToken()
  if (!accessToken) throw new CopilotError(error ?? 'No hay una conexión activa de Google Ads.', 409)
  const developerToken = getGoogleAdsDeveloperToken()
  const loginCustomerId = getGoogleAdsLoginCustomerId()
  const response = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(developerToken ? { 'developer-token': developerToken } : {}), ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new CopilotError(`Google Ads rechazó la operación: ${data.error?.message ?? response.status}`, 502)
  return data as T
}

/** Normaliza el ID de entidad de un evento de historial (Google usa resource names). */
export const changeEventEntityKey = (value: unknown) => String(value ?? '').split('/').pop()!.split('~').pop()!.trim()

export async function loadRecentEdits(supabase: SupabaseClient, clientId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await supabase.from('paid_media_change_events').select('entity_id, occurred_at').eq('client_id', clientId).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(1000)
  const edits = new Map<string, string>()
  if (error) { console.error('[conexa:copilot] historial de cambios', error.message); return edits }
  for (const row of data ?? []) {
    const key = changeEventEntityKey(row.entity_id)
    if (key && !edits.has(key)) edits.set(key, String(row.occurred_at))
  }
  return edits
}

const ageLabel = (min: number, max: number) => `${min} a ${max >= 65 ? '65+' : max}`
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

type InternalStep = PlanStep & { apply: () => Promise<void> }

function step(input: Omit<PlanStep, 'alreadyApplied' | 'pctChange' | 'warnings'> & { pctChange?: number | null; warnings?: string[] }, apply: () => Promise<void>): InternalStep {
  return { ...input, pctChange: input.pctChange ?? null, warnings: input.warnings ?? [], alreadyApplied: input.before === input.after, apply }
}

async function planMeta(operation: Extract<RecommendationOperation, { platform: 'meta' }>, accounts: Set<string>): Promise<InternalStep[]> {
  const assertAccount = (accountId: unknown, name: string) => {
    const id = String(accountId ?? '').replace(/^act_/, '')
    if (!id || !accounts.has(id)) throw new CopilotError(`«${name}» no pertenece a una cuenta de Meta Ads vinculada a este cliente.`, 403)
    return id
  }

  if (operation.kind === 'set_age_range') {
    if (operation.ageMin < 18 || operation.ageMax > 65 || operation.ageMin > operation.ageMax) throw new CopilotError('El rango de edad propuesto no es válido (debe estar entre 18 y 65+).', 422)
    const adsets = await Promise.all(operation.adsets.map((adset) => metaRequest<{ id: string; name?: string; account_id?: string; targeting?: Record<string, unknown> & { age_min?: number; age_max?: number; targeting_automation?: { advantage_audience?: number } } }>(encodeURIComponent(adset.id), { fields: 'id,name,account_id,targeting' })))
    return adsets.map((adset) => {
      const name = adset.name ?? 'Conjunto sin nombre'
      const accountId = assertAccount(adset.account_id, name)
      if (!adset.targeting) throw new CopilotError(`No se pudo leer la segmentación del conjunto «${name}».`, 422)
      const targeting = adset.targeting
      const before = `${targeting.age_min ?? 18}-${targeting.age_max ?? 65}`
      const warnings = targeting.targeting_automation?.advantage_audience === 1 ? ['El conjunto usa público Advantage+: Meta puede tomar el rango de edad como sugerencia y no como límite estricto.'] : []
      return step({ platform: 'meta', accountId, entityType: 'adset', entityId: adset.id, entityName: name, field: 'age_range', before, after: `${operation.ageMin}-${operation.ageMax}`, beforeLabel: `Edad ${ageLabel(targeting.age_min ?? 18, targeting.age_max ?? 65)}`, afterLabel: `Edad ${ageLabel(operation.ageMin, operation.ageMax)}`, warnings },
        async () => { await metaRequest(encodeURIComponent(adset.id), { targeting: JSON.stringify({ ...targeting, age_min: operation.ageMin, age_max: operation.ageMax }) }, 'POST') })
    })
  }

  const entity = await metaRequest<{ id: string; name?: string; account_id?: string; status?: string; daily_budget?: string }>(encodeURIComponent(operation.entityId), { fields: operation.kind === 'set_daily_budget' ? 'id,name,account_id,status,daily_budget' : 'id,name,account_id,status' })
  const name = entity.name ?? operation.entityName
  const accountId = assertAccount(entity.account_id, name)
  if (operation.kind === 'set_status') {
    const before = entity.status ?? 'UNKNOWN'
    return [step({ platform: 'meta', accountId, entityType: operation.level, entityId: operation.entityId, entityName: name, field: 'status', before, after: operation.status, beforeLabel: statusLabel(before), afterLabel: statusLabel(operation.status) },
      async () => { await metaRequest(encodeURIComponent(operation.entityId), { status: operation.status }, 'POST') })]
  }
  const { currency = 'USD' } = await metaRequest<{ currency?: string }>(`act_${accountId}`, { fields: 'currency' })
  const factor = metaCurrencyFactor(currency)
  const current = Number(entity.daily_budget ?? 0) / factor
  const nextMinor = Math.round(operation.dailyBudget * factor)
  const next = nextMinor / factor
  assertBudgetChange(name, current, next, currency)
  return [step({ platform: 'meta', accountId, entityType: operation.level, entityId: operation.entityId, entityName: name, field: 'daily_budget', before: current, after: next, beforeLabel: `${money(current, currency)} / día`, afterLabel: `${money(next, currency)} / día`, pctChange: budgetChange(current, next) },
    async () => { await metaRequest(encodeURIComponent(operation.entityId), { daily_budget: String(nextMinor) }, 'POST') })]
}

async function planGoogle(operation: Extract<RecommendationOperation, { platform: 'google_ads' }>, accounts: Set<string>): Promise<InternalStep[]> {
  const customerId = operation.customerId.replace(/-/g, '')
  if (!accounts.has(customerId)) throw new CopilotError('La cuenta de Google Ads no está vinculada a este cliente.', 403)
  if (!/^\d+$/.test(operation.campaignId)) throw new CopilotError('La campaña de Google Ads indicada no es válida.', 422)
  const search = await googleRequest<{ results?: Array<{ customer?: { currencyCode?: string }; campaign?: { resourceName?: string; name?: string; status?: string }; campaignBudget?: { resourceName?: string; amountMicros?: string; explicitlyShared?: boolean } }> }>(`customers/${customerId}/googleAds:search`, {
    query: `SELECT customer.currency_code, campaign.resource_name, campaign.name, campaign.status, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = ${operation.campaignId} LIMIT 1`,
  })
  const row = search.results?.[0]
  if (!row?.campaign?.resourceName) throw new CopilotError(`La campaña «${operation.entityName}» no existe en la cuenta de Google Ads vinculada.`, 404)
  const campaignResource = row.campaign.resourceName
  const name = row.campaign.name ?? operation.entityName
  if (operation.kind === 'set_status') {
    const before = row.campaign.status ?? 'UNKNOWN'
    return [step({ platform: 'google_ads', accountId: customerId, entityType: 'campaign', entityId: operation.campaignId, entityName: name, field: 'status', before, after: operation.status, beforeLabel: statusLabel(before), afterLabel: statusLabel(operation.status) },
      async () => { await googleRequest(`customers/${customerId}/campaigns:mutate`, { operations: [{ update: { resourceName: campaignResource, status: operation.status }, updateMask: 'status' }] }) })]
  }
  const budgetResource = row.campaignBudget?.resourceName
  if (!budgetResource) throw new CopilotError(`La campaña «${name}» no tiene un presupuesto editable.`, 422)
  if (row.campaignBudget?.explicitlyShared) throw new CopilotError(`La campaña «${name}» usa un presupuesto compartido; modificarlo afectaría a otras campañas.`, 422)
  const currency = row.customer?.currencyCode ?? 'USD'
  const current = Number(row.campaignBudget?.amountMicros ?? 0) / GOOGLE_MICROS
  const nextMicros = Math.round(operation.dailyBudget * 10_000) * 100
  const next = nextMicros / GOOGLE_MICROS
  assertBudgetChange(name, current, next, currency)
  return [step({ platform: 'google_ads', accountId: customerId, entityType: 'campaign', entityId: operation.campaignId, entityName: name, field: 'daily_budget', before: current, after: next, beforeLabel: `${money(current, currency)} / día`, afterLabel: `${money(next, currency)} / día`, pctChange: budgetChange(current, next) },
    async () => { await googleRequest(`customers/${customerId}/campaignBudgets:mutate`, { operations: [{ update: { resourceName: budgetResource, amountMicros: String(nextMicros) }, updateMask: 'amount_micros' }] }) })]
}

function statusLabel(status: string) {
  if (status === 'ACTIVE' || status === 'ENABLED') return 'Activa'
  if (status === 'PAUSED') return 'Pausada'
  if (status === 'ARCHIVED' || status === 'REMOVED') return 'Archivada'
  return status
}

/** Hash estable de los pasos: cambia si cualquier valor actual o propuesto cambia entre la vista previa y la confirmación. */
export function planHash(steps: PlanStep[]) {
  const stable = steps.map(({ platform, accountId, entityType, entityId, field, before, after }) => [platform, accountId, entityType, entityId, field, before, after])
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

/** Lee los valores actuales en la plataforma, valida cuenta vinculada y tope de presupuesto, y arma los pasos sin efectos secundarios. */
export async function buildPlan(supabase: SupabaseClient, clientId: string, operation: RecommendationOperation) {
  const [accounts, recentEdits] = await Promise.all([getClientAdAccounts(supabase, clientId), loadRecentEdits(supabase, clientId, RECENT_EDIT_WINDOW_DAYS)])
  const internal = operation.platform === 'meta' ? await planMeta(operation, accounts.meta) : await planGoogle(operation, accounts.google)
  for (const item of internal) {
    const editedAt = recentEdits.get(item.entityId)
    if (editedAt) item.warnings.push(`«${item.entityName}» tuvo un cambio el ${formatDate(editedAt)}; puede seguir en aprendizaje.`)
  }
  const steps: PlanStep[] = internal.map(({ apply: _apply, ...rest }) => rest)
  const plan: ExecutionPlan = { steps, hash: planHash(steps) }
  return { plan, internal }
}

export async function executePlan(internal: InternalStep[]): Promise<PlanStepResult[]> {
  const results: PlanStepResult[] = []
  for (const item of internal) {
    const { apply, ...publicStep } = item
    if (item.alreadyApplied) { results.push({ ...publicStep, outcome: 'skipped' }); continue }
    try {
      await apply()
      results.push({ ...publicStep, outcome: 'success' })
    } catch (error) {
      results.push({ ...publicStep, outcome: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'La plataforma no pudo aplicar el cambio.' })
    }
  }
  return results
}
