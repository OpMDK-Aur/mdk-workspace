import type { SupabaseClient } from '@supabase/supabase-js'
import { defaultMetaDateRange, getMetaAccountMetrics } from '@/lib/meta-ads/service'
import { CATALOG_LIMIT_PER_PLATFORM } from './config'
import { getClientAdAccounts, GOOGLE_MICROS, googleRequest, loadRecentEdits, metaCurrencyFactor, metaRequest, money } from './executors'

export type MetaCatalogCampaign = { id: string; name: string; status: string; deliveryStatus: string; dailyBudget: number | null; spend30d: number; results30d: number; costPerResult30d: number | null; lastEditedAt: string | null }
export type MetaCatalogAdset = { id: string; name: string; campaignId: string; status: string; deliveryStatus: string; dailyBudget: number | null; destinationType: string | null; ageMin: number | null; ageMax: number | null; advantageAudience: boolean | null; spend30d: number; results30d: number; costPerResult30d: number | null; lastEditedAt: string | null }
export type MetaCatalogAd = { id: string; name: string; adsetId: string; status: string; deliveryStatus: string; spend30d: number; results30d: number; lastEditedAt: string | null }
export type GoogleCatalogCampaign = { id: string; name: string; status: string; dailyBudget: number | null; budgetShared: boolean; spend30d: number; conversions30d: number; costPerConversion30d: number | null; lastEditedAt: string | null }

export type MetaCatalogAccount = { accountId: string; currency: string; campaigns: MetaCatalogCampaign[]; adsets: MetaCatalogAdset[]; ads: MetaCatalogAd[] }
export type GoogleCatalogAccount = { customerId: string; currency: string; campaigns: GoogleCatalogCampaign[] }
/** Un cliente puede tener varias cuentas por plataforma, por eso cada plataforma es una lista de cuentas. */
export type EntityCatalog = { meta?: MetaCatalogAccount[]; googleAds?: GoogleCatalogAccount[] }

const MAX_ACCOUNTS = 5
const HIDDEN_STATUSES = new Set(['ARCHIVED', 'DELETED', 'REMOVED'])
const round = (value: number) => Math.round(value * 100) / 100

/** Primero las entidades activas, después por gasto descendente. */
function prioritize<T extends { deliveryStatus?: string; status: string; spend30d: number }>(items: T[]) {
  const isActive = (item: T) => (item.deliveryStatus ?? item.status) === 'ACTIVE' || item.status === 'ENABLED'
  return [...items].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.spend30d - a.spend30d).slice(0, CATALOG_LIMIT_PER_PLATFORM)
}

type MetaRaw = { id: string; name?: string; status?: string; effective_status?: string; daily_budget?: string; campaign_id?: string; adset_id?: string; destination_type?: string; targeting?: { age_min?: number; age_max?: number; targeting_automation?: { advantage_audience?: number } } }

async function metaAccountCatalog(accountId: string, withMetrics: boolean, edits: Map<string, string>): Promise<MetaCatalogAccount> {
  const range = defaultMetaDateRange()
  const [account, campaigns, adsets, ads, metrics] = await Promise.all([
    metaRequest<{ currency?: string }>(`act_${accountId}`, { fields: 'currency' }),
    metaRequest<{ data?: MetaRaw[] }>(`act_${accountId}/campaigns`, { fields: 'id,name,status,effective_status,daily_budget', limit: '200' }),
    metaRequest<{ data?: MetaRaw[] }>(`act_${accountId}/adsets`, { fields: 'id,name,status,effective_status,campaign_id,daily_budget,destination_type,targeting', limit: '200' }),
    metaRequest<{ data?: MetaRaw[] }>(`act_${accountId}/ads`, { fields: 'id,name,status,effective_status,adset_id', limit: '300' }),
    withMetrics ? getMetaAccountMetrics({ accountId, dateFrom: range.dateFrom, dateTo: range.dateTo, onlyActiveCampaigns: false }).catch(() => null) : Promise.resolve(null),
  ])
  const currency = account.currency ?? 'USD'
  const factor = metaCurrencyFactor(currency)
  const byId = new Map<string, { spend: number; results: number }>()
  for (const row of [...(metrics?.campaigns ?? []), ...(metrics?.adsets ?? []), ...(metrics?.ads ?? [])]) byId.set(row.id, { spend: row.spend, results: row.results })
  const stats = (id: string) => {
    const row = byId.get(id) ?? { spend: 0, results: 0 }
    return { spend30d: round(row.spend), results30d: row.results, costPerResult30d: row.results > 0 ? round(row.spend / row.results) : null }
  }
  const visible = (rows?: MetaRaw[]) => (rows ?? []).filter((row) => !HIDDEN_STATUSES.has(row.effective_status ?? row.status ?? ''))
  const budget = (value?: string) => (Number(value) > 0 ? Number(value) / factor : null)

  return {
    accountId,
    currency,
    campaigns: prioritize(visible(campaigns.data).map((row) => ({ id: row.id, name: row.name ?? 'Campaña sin nombre', status: row.status ?? '', deliveryStatus: row.effective_status ?? '', dailyBudget: budget(row.daily_budget), ...stats(row.id), lastEditedAt: edits.get(row.id) ?? null }))),
    adsets: prioritize(visible(adsets.data).map((row) => ({
      id: row.id, name: row.name ?? 'Conjunto sin nombre', campaignId: row.campaign_id ?? '', status: row.status ?? '', deliveryStatus: row.effective_status ?? '', dailyBudget: budget(row.daily_budget),
      destinationType: row.destination_type ?? null,
      ageMin: row.targeting?.age_min ?? (row.targeting ? 18 : null), ageMax: row.targeting?.age_max ?? (row.targeting ? 65 : null),
      advantageAudience: row.targeting?.targeting_automation?.advantage_audience === undefined ? null : row.targeting.targeting_automation.advantage_audience === 1,
      ...stats(row.id), lastEditedAt: edits.get(row.id) ?? null,
    }))),
    ads: prioritize(visible(ads.data).map((row) => {
      const { spend30d, results30d } = stats(row.id)
      return { id: row.id, name: row.name ?? 'Anuncio sin nombre', adsetId: row.adset_id ?? '', status: row.status ?? '', deliveryStatus: row.effective_status ?? '', spend30d, results30d, lastEditedAt: edits.get(row.id) ?? null }
    })),
  }
}

type GoogleRow = { customer?: { currencyCode?: string }; campaign?: { id?: string; name?: string; status?: string }; campaignBudget?: { amountMicros?: string; explicitlyShared?: boolean }; metrics?: { costMicros?: string; conversions?: number | string } }

async function googleAccountCatalog(customerId: string, withMetrics: boolean, edits: Map<string, string>): Promise<GoogleCatalogAccount> {
  const [structure, metrics] = await Promise.all([
    googleRequest<{ results?: GoogleRow[] }>(`customers/${customerId}/googleAds:search`, { query: "SELECT customer.currency_code, campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED') LIMIT 200" }),
    withMetrics ? googleRequest<{ results?: GoogleRow[] }>(`customers/${customerId}/googleAds:search`, { query: "SELECT campaign.id, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status IN ('ENABLED', 'PAUSED') LIMIT 500" }).catch(() => null) : Promise.resolve(null),
  ])
  const byId = new Map((metrics?.results ?? []).map((row) => [String(row.campaign?.id ?? ''), { spend: Number(row.metrics?.costMicros ?? 0) / GOOGLE_MICROS, conversions: Number(row.metrics?.conversions ?? 0) }]))
  const rows = structure.results ?? []
  return {
    customerId,
    currency: rows[0]?.customer?.currencyCode ?? 'USD',
    campaigns: prioritize(rows.filter((row) => row.campaign?.id).map((row) => {
      const id = String(row.campaign!.id)
      const stat = byId.get(id) ?? { spend: 0, conversions: 0 }
      const amount = Number(row.campaignBudget?.amountMicros ?? 0)
      return { id, name: row.campaign?.name ?? 'Campaña sin nombre', status: row.campaign?.status ?? '', dailyBudget: amount > 0 ? amount / GOOGLE_MICROS : null, budgetShared: row.campaignBudget?.explicitlyShared === true, spend30d: round(stat.spend), conversions30d: round(stat.conversions), costPerConversion30d: stat.conversions > 0 ? round(stat.spend / stat.conversions) : null, lastEditedAt: edits.get(id) ?? null }
    })),
  }
}

/** Entidades reales de las cuentas vinculadas al cliente. withMetrics=false se usa para validar ediciones sin leer insights. */
export async function buildEntityCatalog(supabase: SupabaseClient, clientId: string, options: { withMetrics?: boolean } = {}) {
  const withMetrics = options.withMetrics ?? true
  const [accounts, edits] = await Promise.all([getClientAdAccounts(supabase, clientId), loadRecentEdits(supabase, clientId, 30)])
  const settle = async <T>(label: string, task: Promise<T>) => {
    try { return await task } catch (error) { console.error(`[conexa:copilot:catalog] ${label}`, error instanceof Error ? error.message : error); return null }
  }
  const [meta, google] = await Promise.all([
    Promise.all([...accounts.meta].slice(0, MAX_ACCOUNTS).map((id) => settle(`Meta ${id}`, metaAccountCatalog(id, withMetrics, edits)))),
    Promise.all([...accounts.google].slice(0, MAX_ACCOUNTS).map((id) => settle(`Google ${id}`, googleAccountCatalog(id, withMetrics, edits)))),
  ])
  const catalog: EntityCatalog = {}
  const metaAccounts = meta.filter((item): item is MetaCatalogAccount => Boolean(item))
  const googleAccounts = google.filter((item): item is GoogleCatalogAccount => Boolean(item))
  if (metaAccounts.length) catalog.meta = metaAccounts
  if (googleAccounts.length) catalog.googleAds = googleAccounts
  return { catalog, linkedAccounts: accounts }
}

const LEVEL_LABEL = { campaign: 'Campaña', adset: 'Conjunto', ad: 'Anuncio' } as const

/** Fuentes citables por el modelo en evidenceIds; las etiquetas usan nombres, nunca IDs. */
export function catalogSourceItems(catalog: EntityCatalog) {
  const items: Array<{ id: string; label: string; excerpt: string }> = []
  const lastEdit = (value: string | null) => (value ? ` · último cambio ${new Date(value).toLocaleDateString('es-AR')}` : '')
  for (const account of catalog.meta ?? []) {
    const amount = (value: number | null) => (value === null ? 'sin dato' : money(value, account.currency))
    for (const item of account.campaigns) items.push({ id: `meta:campaign:${item.id}`, label: `Meta Ads · ${LEVEL_LABEL.campaign} «${item.name}»`, excerpt: `Estado ${item.deliveryStatus || item.status} · gasto 30 días ${amount(item.spend30d)} · ${item.results30d} resultados · costo por resultado ${amount(item.costPerResult30d)} · presupuesto diario ${item.dailyBudget === null ? 'a nivel conjunto' : amount(item.dailyBudget)}${lastEdit(item.lastEditedAt)}` })
    for (const item of account.adsets) items.push({ id: `meta:adset:${item.id}`, label: `Meta Ads · ${LEVEL_LABEL.adset} «${item.name}»`, excerpt: `Estado ${item.deliveryStatus || item.status} · destino ${item.destinationType ?? 'sin dato'} · edad ${item.ageMin ?? '?'}-${item.ageMax ?? '?'} · gasto 30 días ${amount(item.spend30d)} · ${item.results30d} resultados · costo por resultado ${amount(item.costPerResult30d)} · presupuesto diario ${item.dailyBudget === null ? 'a nivel campaña' : amount(item.dailyBudget)}${lastEdit(item.lastEditedAt)}` })
    for (const item of account.ads) items.push({ id: `meta:ad:${item.id}`, label: `Meta Ads · ${LEVEL_LABEL.ad} «${item.name}»`, excerpt: `Estado ${item.deliveryStatus || item.status} · gasto 30 días ${amount(item.spend30d)} · ${item.results30d} resultados${lastEdit(item.lastEditedAt)}` })
  }
  for (const account of catalog.googleAds ?? []) {
    const amount = (value: number | null) => (value === null ? 'sin dato' : money(value, account.currency))
    for (const item of account.campaigns) items.push({ id: `gads:campaign:${item.id}`, label: `Google Ads · Campaña «${item.name}»`, excerpt: `Estado ${item.status} · gasto 30 días ${amount(item.spend30d)} · ${item.conversions30d} conversiones · costo por conversión ${amount(item.costPerConversion30d)} · presupuesto diario ${amount(item.dailyBudget)}${item.budgetShared ? ' (compartido)' : ''}${lastEdit(item.lastEditedAt)}` })
  }
  return items
}
