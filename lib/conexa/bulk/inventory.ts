import 'server-only'
import { getMetaAccessToken } from '@/lib/meta-ads/token'
import { campaignNameKey, normalizeText } from './text'
import type { Inventory, InventoryAccount, InventoryAd, InventoryAdset, InventoryCampaign } from './types'

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`
const MAX_PAGES = 5

export const act = (accountId: string) => `act_${accountId.replace(/^act_/, '')}`

export class MetaReadError extends Error {}

export async function metaGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = await getMetaAccessToken()
  if (!token) throw new MetaReadError('META_ADS_ACCESS_TOKEN no está configurado.')
  const response = await fetch(`${META_BASE_URL}/${path}?${new URLSearchParams({ ...params, access_token: token })}`, { cache: 'no-store' })
  const payload = await response.json().catch(() => null) as ({ error?: { message?: string; error_user_msg?: string } } & T) | null
  if (!response.ok || payload?.error) throw new MetaReadError(payload?.error?.error_user_msg || payload?.error?.message || `Meta respondió ${response.status}.`)
  return payload as T
}

export async function metaPost<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = await getMetaAccessToken()
  if (!token) throw new MetaReadError('META_ADS_ACCESS_TOKEN no está configurado.')
  const response = await fetch(`${META_BASE_URL}/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }), cache: 'no-store' })
  const payload = await response.json().catch(() => null) as ({ error?: { message?: string; error_user_msg?: string } } & T) | null
  if (!response.ok || payload?.error) throw new MetaReadError(payload?.error?.error_user_msg || payload?.error?.message || `Meta respondió ${response.status}.`)
  return payload as T
}

async function listAll<T>(path: string, params: Record<string, string>) {
  const items: T[] = []
  let after: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await metaGet<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, { ...params, limit: '200', ...(after ? { after } : {}) })
    items.push(...(result.data ?? []))
    after = result.paging?.next ? result.paging.cursors?.after : undefined
    if (!after) break
  }
  return items
}

type RawCampaign = { id: string; name?: string; objective?: string; effective_status?: string; daily_budget?: string }
type RawAdset = { id: string; name?: string; campaign_id?: string; effective_status?: string; destination_type?: string; daily_budget?: string; optimization_goal?: string; end_time?: string; promoted_object?: { page_id?: string; pixel_id?: string; whatsapp_phone_number?: string }; targeting?: { facebook_positions?: string[]; instagram_positions?: string[]; messenger_positions?: string[] } }
type RawCta = { value?: { lead_gen_form_id?: string } }
type RawAd = { id: string; name?: string; adset_id?: string; effective_status?: string; creative?: { id?: string; name?: string; thumbnail_url?: string; body?: string; title?: string; object_story_spec?: { link_data?: { message?: string; name?: string; call_to_action?: RawCta }; video_data?: { message?: string; title?: string; call_to_action?: RawCta } } } }

const ACTIVE_FILTER = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW'] }])

const minorToMajor = (value: string | undefined, currency: string) => {
  if (!value) return undefined
  const zeroDecimal = ['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'].includes(currency)
  return Number(value) / (zeroDecimal ? 1 : 100)
}

export async function loadAccountInventory(accountId: string): Promise<Inventory> {
  const account = await metaGet<{ name?: string; currency?: string }>(act(accountId), { fields: 'name,currency' })
  const currency = account.currency ?? 'USD'
  const [campaigns, adsets, ads] = await Promise.all([
    listAll<RawCampaign>(`${act(accountId)}/campaigns`, { fields: 'id,name,objective,effective_status,daily_budget', filtering: ACTIVE_FILTER }),
    listAll<RawAdset>(`${act(accountId)}/adsets`, { fields: 'id,name,campaign_id,effective_status,destination_type,daily_budget,optimization_goal,promoted_object,end_time,targeting{facebook_positions,instagram_positions,messenger_positions}', filtering: ACTIVE_FILTER }),
    listAll<RawAd>(`${act(accountId)}/ads`, { fields: 'id,name,adset_id,effective_status,creative.thumbnail_width(320).thumbnail_height(320){id,name,thumbnail_url,body,title,object_story_spec}', filtering: ACTIVE_FILTER }),
  ])
  return {
    accounts: [{ id: accountId, name: account.name ?? accountId }],
    currency: { [accountId]: currency },
    campaigns: campaigns.map((item): InventoryCampaign => ({ id: item.id, accountId, name: item.name ?? '', objective: item.objective ?? '', status: item.effective_status ?? '', dailyBudget: minorToMajor(item.daily_budget, currency), isCbo: Boolean(item.daily_budget) })),
    adsets: adsets.map((item): InventoryAdset => ({
      id: item.id, accountId, campaignId: item.campaign_id ?? '', name: item.name ?? '', status: item.effective_status ?? '', destination: item.destination_type ?? '',
      dailyBudget: minorToMajor(item.daily_budget, currency), pageId: item.promoted_object?.page_id, optimizationGoal: item.optimization_goal, hasPixel: Boolean(item.promoted_object?.pixel_id),
      endTime: item.end_time, whatsappNumber: item.promoted_object?.whatsapp_phone_number,
      positions: [
        ...(item.targeting?.facebook_positions ?? []).map((position) => `facebook:${position}`),
        ...(item.targeting?.instagram_positions ?? []).map((position) => `instagram:${position}`),
        ...(item.targeting?.messenger_positions ?? []).map((position) => `messenger:${position}`),
      ],
    })),
    ads: ads.map((item): InventoryAd => {
      const story = item.creative?.object_story_spec
      return {
        id: item.id, accountId, adsetId: item.adset_id ?? '', name: item.name ?? '', status: item.effective_status,
        leadFormId: story?.link_data?.call_to_action?.value?.lead_gen_form_id || story?.video_data?.call_to_action?.value?.lead_gen_form_id || undefined,
        creativeId: item.creative?.id, creativeName: item.creative?.name, thumbnail: item.creative?.thumbnail_url,
        primaryText: item.creative?.body || story?.link_data?.message || story?.video_data?.message || '',
        headline: item.creative?.title || story?.link_data?.name || story?.video_data?.title || '',
      }
    }),
  }
}

const GENERIC_ACCOUNT_TOKENS = new Set(['provisoria', 'cuenta', 'cuentas', 'publicitaria', 'automotores', 'automotriz', 'grupo', 'meta', 'ads', 'business', 'manager'])
const accountTokens = (value: string) => normalizeText(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !/^\d+$/.test(token) && !GENERIC_ACCOUNT_TOKENS.has(token))

/**
 * Clients often run campaigns from an ad account that was never linked in the app (e.g. a "Provisoria" one).
 * Looks for token-accessible accounts whose name shares a distinctive word with the client or its linked
 * accounts, and keeps only those that actually hold one of the wanted campaign names.
 */
export async function discoverSiblingAccounts(linked: InventoryAccount[], clientName: string, wantedNames: string[]) {
  const wanted = new Set(wantedNames.map(campaignNameKey).filter(Boolean))
  const tokens = new Set([clientName, ...linked.map((account) => account.name)].flatMap(accountTokens))
  if (!wanted.size || !tokens.size) return []
  const linkedIds = new Set(linked.map((account) => account.id.replace(/^act_/, '')))
  const all = await listAll<{ id: string; name?: string }>('me/adaccounts', { fields: 'id,name' })
  const candidates = all
    .map((account) => ({ id: account.id.replace(/^act_/, ''), name: account.name ?? '' }))
    .filter((account) => !linkedIds.has(account.id) && accountTokens(account.name).some((token) => tokens.has(token)))
    .slice(0, 6)
  const hits = await Promise.all(candidates.map(async (account) => {
    const campaigns = await listAll<{ name?: string }>(`${act(account.id)}/campaigns`, { fields: 'name', filtering: ACTIVE_FILTER }).catch(() => [])
    const found = campaigns.filter((campaign) => wanted.has(campaignNameKey(campaign.name ?? ''))).map((campaign) => campaign.name ?? '')
    return found.length ? { ...account, found } : null
  }))
  return hits.filter((hit): hit is NonNullable<typeof hit> => Boolean(hit))
}

export async function loadInventory(accountIds: string[]) {
  const results = await Promise.allSettled(accountIds.map(loadAccountInventory))
  const inventory: Inventory = { accounts: [], campaigns: [], adsets: [], ads: [], currency: {} }
  const warnings: string[] = []
  const failedNames = await Promise.all(results.map((result, index) => result.status === 'rejected'
    ? metaGet<{ name?: string }>(act(accountIds[index]), { fields: 'name' }).then((account) => account.name).catch(() => undefined)
    : undefined))
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const name = failedNames[index] ?? accountIds[index]
      inventory.accounts.push({ id: accountIds[index], name })
      warnings.push(`No pude leer las campañas de ${name}: ${result.reason instanceof Error ? result.reason.message : 'error de Meta'}`)
      return
    }
    inventory.accounts.push(...result.value.accounts)
    inventory.campaigns.push(...result.value.campaigns)
    inventory.adsets.push(...result.value.adsets)
    inventory.ads.push(...result.value.ads)
    Object.assign(inventory.currency, result.value.currency)
  })
  return { inventory, warnings }
}
