import 'server-only'
import { getMetaAccessToken } from '@/lib/meta-ads/token'
import type { Inventory, InventoryAd, InventoryAdset, InventoryCampaign } from './types'

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
type RawAdset = { id: string; name?: string; campaign_id?: string; effective_status?: string; destination_type?: string; daily_budget?: string; optimization_goal?: string; promoted_object?: { page_id?: string; pixel_id?: string } }
type RawAd = { id: string; name?: string; adset_id?: string; creative?: { id?: string; name?: string; thumbnail_url?: string; body?: string; title?: string; object_story_spec?: { link_data?: { message?: string; name?: string }; video_data?: { message?: string; title?: string } } } }

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
    listAll<RawAdset>(`${act(accountId)}/adsets`, { fields: 'id,name,campaign_id,effective_status,destination_type,daily_budget,optimization_goal,promoted_object', filtering: ACTIVE_FILTER }),
    listAll<RawAd>(`${act(accountId)}/ads`, { fields: 'id,name,adset_id,creative.thumbnail_width(320).thumbnail_height(320){id,name,thumbnail_url,body,title,object_story_spec}', filtering: ACTIVE_FILTER }),
  ])
  return {
    accounts: [{ id: accountId, name: account.name ?? accountId }],
    currency: { [accountId]: currency },
    campaigns: campaigns.map((item): InventoryCampaign => ({ id: item.id, accountId, name: item.name ?? '', objective: item.objective ?? '', status: item.effective_status ?? '', dailyBudget: minorToMajor(item.daily_budget, currency), isCbo: Boolean(item.daily_budget) })),
    adsets: adsets.map((item): InventoryAdset => ({
      id: item.id, accountId, campaignId: item.campaign_id ?? '', name: item.name ?? '', status: item.effective_status ?? '', destination: item.destination_type ?? '',
      dailyBudget: minorToMajor(item.daily_budget, currency), pageId: item.promoted_object?.page_id, optimizationGoal: item.optimization_goal, hasPixel: Boolean(item.promoted_object?.pixel_id),
    })),
    ads: ads.map((item): InventoryAd => {
      const story = item.creative?.object_story_spec
      return {
        id: item.id, accountId, adsetId: item.adset_id ?? '', name: item.name ?? '', creativeId: item.creative?.id, creativeName: item.creative?.name, thumbnail: item.creative?.thumbnail_url,
        primaryText: item.creative?.body || story?.link_data?.message || story?.video_data?.message || '',
        headline: item.creative?.title || story?.link_data?.name || story?.video_data?.title || '',
      }
    }),
  }
}

export async function loadInventory(accountIds: string[]) {
  const results = await Promise.allSettled(accountIds.map(loadAccountInventory))
  const inventory: Inventory = { accounts: [], campaigns: [], adsets: [], ads: [], currency: {} }
  const warnings: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      warnings.push(`No pude leer la cuenta ${accountIds[index]}: ${result.reason instanceof Error ? result.reason.message : 'error de Meta'}`)
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
