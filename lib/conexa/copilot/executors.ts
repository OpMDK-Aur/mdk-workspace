import type { SupabaseClient } from '@supabase/supabase-js'
import { getMetaAccessToken, META_GRAPH_VERSION } from '@/lib/meta-ads/token'
import { getGoogleAdsAccessToken, getGoogleAdsDeveloperToken, getGoogleAdsLoginCustomerId } from '@/lib/google-tokens'
import { CopilotError } from './route-helpers'
import type { ExecutionResult, RecommendationOperation } from './types'

const GOOGLE_ADS_API_VERSION = 'v23'
const MAX_BUDGET_CHANGE = 0.3
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])
const splitIds = (value: unknown) => String(value ?? '').split(',').map((id) => id.trim()).filter(Boolean)

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

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2 }).format(amount) } catch { return `${amount} ${currency}` }
}

function assertBudgetChange(current: number, next: number) {
  if (!Number.isFinite(next) || next <= 0) throw new CopilotError('El presupuesto propuesto no es válido.', 422)
  if (current <= 0) throw new CopilotError('La entidad no tiene un presupuesto diario propio para modificar.', 422)
  if (Math.abs(next - current) / current > MAX_BUDGET_CHANGE) throw new CopilotError(`El cambio de presupuesto supera el límite de seguridad de ±${MAX_BUDGET_CHANGE * 100}% sobre el valor actual. Pedile al chat que reformule la recomendación.`, 422)
}

async function metaRequest<T>(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): Promise<T> {
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

async function executeMeta(operation: Extract<RecommendationOperation, { platform: 'meta' }>, accounts: Set<string>): Promise<ExecutionResult> {
  const entity = await metaRequest<{ id: string; name?: string; account_id?: string; status?: string; daily_budget?: string }>(encodeURIComponent(operation.entityId), { fields: operation.level === 'ad' ? 'id,name,account_id,status' : 'id,name,account_id,status,daily_budget' })
  const accountId = String(entity.account_id ?? '').replace(/^act_/, '')
  if (!accountId || !accounts.has(accountId)) throw new CopilotError('La entidad de Meta no pertenece a una cuenta vinculada a este cliente.', 403)
  const name = entity.name ?? operation.entityName
  if (operation.kind === 'set_status') {
    if (entity.status === operation.status) throw new CopilotError(`La entidad ya está en estado ${operation.status}.`, 409)
    await metaRequest(encodeURIComponent(operation.entityId), { status: operation.status }, 'POST')
    return { platform: 'meta', entityId: operation.entityId, entityName: name, before: `Estado ${entity.status ?? 'desconocido'}`, after: `Estado ${operation.status}`, executedAt: new Date().toISOString() }
  }
  const { currency = 'USD' } = await metaRequest<{ currency?: string }>(`act_${accountId}`, { fields: 'currency' })
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100
  const currentMinor = Number(entity.daily_budget ?? 0)
  const nextMinor = Math.round(operation.dailyBudget * factor)
  assertBudgetChange(currentMinor, nextMinor)
  await metaRequest(encodeURIComponent(operation.entityId), { daily_budget: String(nextMinor) }, 'POST')
  return { platform: 'meta', entityId: operation.entityId, entityName: name, before: `${money(currentMinor / factor, currency)} / día`, after: `${money(nextMinor / factor, currency)} / día`, executedAt: new Date().toISOString() }
}

async function googleRequest<T>(path: string, body: unknown): Promise<T> {
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

async function executeGoogle(operation: Extract<RecommendationOperation, { platform: 'google_ads' }>, accounts: Set<string>): Promise<ExecutionResult> {
  const customerId = operation.customerId.replace(/-/g, '')
  if (!accounts.has(customerId)) throw new CopilotError('La cuenta de Google Ads no está vinculada a este cliente.', 403)
  if (!/^\d+$/.test(operation.campaignId)) throw new CopilotError('El ID de campaña de Google Ads no es válido.', 422)
  const search = await googleRequest<{ results?: Array<{ customer?: { currencyCode?: string }; campaign?: { resourceName?: string; name?: string; status?: string }; campaignBudget?: { resourceName?: string; amountMicros?: string; explicitlyShared?: boolean } }> }>(`customers/${customerId}/googleAds:search`, {
    query: `SELECT customer.currency_code, campaign.resource_name, campaign.name, campaign.status, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = ${operation.campaignId} LIMIT 1`,
  })
  const row = search.results?.[0]
  if (!row?.campaign?.resourceName) throw new CopilotError('La campaña de Google Ads no existe en la cuenta vinculada.', 404)
  const name = row.campaign.name ?? operation.entityName
  if (operation.kind === 'set_status') {
    if (row.campaign.status === operation.status) throw new CopilotError(`La campaña ya está en estado ${operation.status}.`, 409)
    await googleRequest(`customers/${customerId}/campaigns:mutate`, { operations: [{ update: { resourceName: row.campaign.resourceName, status: operation.status }, updateMask: 'status' }] })
    return { platform: 'google_ads', entityId: operation.campaignId, entityName: name, before: `Estado ${row.campaign.status ?? 'desconocido'}`, after: `Estado ${operation.status}`, executedAt: new Date().toISOString() }
  }
  if (!row.campaignBudget?.resourceName) throw new CopilotError('La campaña no tiene un presupuesto editable.', 422)
  if (row.campaignBudget.explicitlyShared) throw new CopilotError('La campaña usa un presupuesto compartido; modificarlo afectaría a otras campañas.', 422)
  const currency = row.customer?.currencyCode ?? 'USD'
  const currentMicros = Number(row.campaignBudget.amountMicros ?? 0)
  const nextMicros = Math.round(operation.dailyBudget * 10_000) * 100
  assertBudgetChange(currentMicros, nextMicros)
  await googleRequest(`customers/${customerId}/campaignBudgets:mutate`, { operations: [{ update: { resourceName: row.campaignBudget.resourceName, amountMicros: String(nextMicros) }, updateMask: 'amount_micros' }] })
  return { platform: 'google_ads', entityId: operation.campaignId, entityName: name, before: `${money(currentMicros / 1_000_000, currency)} / día`, after: `${money(nextMicros / 1_000_000, currency)} / día`, executedAt: new Date().toISOString() }
}

export async function executeOperation(supabase: SupabaseClient, clientId: string, operation: RecommendationOperation) {
  const accounts = await getClientAdAccounts(supabase, clientId)
  return operation.platform === 'meta' ? executeMeta(operation, accounts.meta) : executeGoogle(operation, accounts.google)
}
