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
type RawAd = {
  id: string; name?: string; adset_id?: string; effective_status?: string; created_time?: string
  creative?: {
    id?: string; name?: string; thumbnail_url?: string; body?: string; title?: string
    object_story_spec?: { link_data?: { message?: string; name?: string; call_to_action?: RawCta }; video_data?: { message?: string; title?: string; call_to_action?: RawCta } }
    asset_feed_spec?: { call_to_actions?: RawCta[]; bodies?: Array<{ text?: string }>; titles?: Array<{ text?: string }> }
  }
}

// Ads with per-placement or dynamic creatives carry the form in asset_feed_spec, not in object_story_spec.
const leadFormOf = (creative: RawAd['creative']) => {
  const story = creative?.object_story_spec
  return story?.link_data?.call_to_action?.value?.lead_gen_form_id || story?.video_data?.call_to_action?.value?.lead_gen_form_id
    || creative?.asset_feed_spec?.call_to_actions?.map((cta) => cta?.value?.lead_gen_form_id).find(Boolean) || undefined
}

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
    listAll<RawAd>(`${act(accountId)}/ads`, { fields: 'id,name,adset_id,effective_status,created_time,creative.thumbnail_width(320).thumbnail_height(320){id,name,thumbnail_url,body,title,object_story_spec,asset_feed_spec{call_to_actions,bodies,titles}}', filtering: ACTIVE_FILTER }),
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
        id: item.id, accountId, adsetId: item.adset_id ?? '', name: item.name ?? '', status: item.effective_status, createdTime: item.created_time,
        leadFormId: leadFormOf(item.creative),
        creativeId: item.creative?.id, creativeName: item.creative?.name, thumbnail: item.creative?.thumbnail_url,
        primaryText: item.creative?.body || story?.link_data?.message || story?.video_data?.message || item.creative?.asset_feed_spec?.bodies?.[0]?.text || '',
        headline: item.creative?.title || story?.link_data?.name || story?.video_data?.title || item.creative?.asset_feed_spec?.titles?.[0]?.text || '',
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

const NO_PAGE_ACCESS = 'el token de Meta no tiene acceso a la página que tiene el formulario: asigná la página al usuario del sistema en el Business Manager con permiso de clientes potenciales'
const NO_PAGE_PERMISSION = 'al token de Meta de la app le falta el permiso pages_read_engagement, y sin él Meta no deja leer los nombres de los formularios. Hay que generar el token del usuario del sistema con ese permiso (y leads_retrieval)'
const RATE_LIMITED = 'Meta limitó las consultas de la app por ahora (#4). Volvé a generar el plan en unos minutos para ver los nombres'

// Permission and rate-limit errors repeat for every form, so the first one stops the lookup and is shown once.
function blockingReason(message: string) {
  if (/\(#(4|17|32|613)\)|request limit/i.test(message)) return RATE_LIMITED
  if (/\(#(10|200)\)|pages_read_engagement|Page Public/i.test(message)) return NO_PAGE_PERMISSION
  return null
}

/**
 * Form names and status can only be read with the token of the page that owns the form.
 * Page tokens come from me/accounts and, for pages not listed there, from the businesses' owned and client pages.
 * With a page token, one leadgen_forms call names every form of that page; forms still unnamed are read one by one.
 */
export async function loadLeadFormDetails(inventory: Inventory) {
  const formAdsets = inventory.adsets.filter((adset) => adset.destination === 'ON_AD' || inventory.ads.some((ad) => ad.adsetId === adset.id && ad.leadFormId))
  const formIds = [...new Set(inventory.ads.filter((ad) => ad.leadFormId && formAdsets.some((adset) => adset.id === ad.adsetId)).map((ad) => ad.leadFormId!))].slice(0, 60)
  const pageIds = [...new Set(formAdsets.map((adset) => adset.pageId).filter((id): id is string => Boolean(id)))].slice(0, 10)
  if (!formIds.length && !pageIds.length) return
  const token = await getMetaAccessToken()
  const getWith = async <T>(path: string, params: Record<string, string>, accessToken?: string | null) => {
    const response = await fetch(`${META_BASE_URL}/${path}?${new URLSearchParams({ ...params, access_token: accessToken ?? '' })}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null) as ({ error?: { message?: string } } & T) | null
    if (!response.ok || payload?.error) throw new MetaReadError(payload?.error?.message || `Meta respondió ${response.status}.`)
    return payload as T
  }

  const pageToken = new Map<string, string>()
  const pages = await listAll<{ id: string; access_token?: string }>('me/accounts', { fields: 'id,access_token' }).catch(() => [])
  for (const page of pages) if (page.access_token) pageToken.set(page.id, page.access_token)
  if (pageIds.some((id) => !pageToken.has(id))) {
    const businesses = await listAll<{ id: string }>('me/businesses', { fields: 'id' }).catch(() => [])
    for (const business of businesses.slice(0, 10)) {
      for (const edge of ['owned_pages', 'client_pages']) {
        if (pageIds.every((id) => pageToken.has(id))) break
        const found = await listAll<{ id: string; access_token?: string }>(`${business.id}/${edge}`, { fields: 'id,access_token' }).catch(() => [])
        for (const page of found) if (page.access_token && !pageToken.has(page.id)) pageToken.set(page.id, page.access_token)
      }
    }
  }

  inventory.leadForms = {}
  inventory.pageForms = {}
  inventory.pageAccessErrors = {}
  let blocked: string | null = null
  const note = (error: unknown) => {
    const message = error instanceof Error ? error.message : ''
    blocked ??= blockingReason(message)
    return message
  }

  await Promise.all(pageIds.map(async (pageId) => {
    const accessToken = pageToken.get(pageId)
    if (!accessToken) {
      inventory.pageAccessErrors![pageId] = `No puedo leer los formularios: ${NO_PAGE_ACCESS}`
      return
    }
    try {
      const result = await getWith<{ data?: Array<{ id: string; name?: string; status?: string }> }>(`${pageId}/leadgen_forms`, { fields: 'id,name,status', limit: '200' }, accessToken)
      const forms = (result.data ?? []).map((form) => ({ id: form.id, name: form.name, status: form.status, pageId }))
      for (const form of forms) inventory.leadForms![form.id] = form
      inventory.pageForms![pageId] = forms.filter((form) => form.status === 'ACTIVE')
    } catch (error) {
      inventory.pageAccessErrors![pageId] = note(error) || 'Meta no devolvió los formularios de la página'
    }
  }))

  const pageOfForm = new Map(inventory.ads.filter((ad) => ad.leadFormId).map((ad) => [ad.leadFormId!, inventory.adsets.find((adset) => adset.id === ad.adsetId)?.pageId]))
  // Sequential on purpose: one permission or rate-limit error is enough to know the rest will fail too.
  for (const id of formIds.filter((formId) => !inventory.leadForms![formId]?.name)) {
    const pageId = pageOfForm.get(id)
    const ownPageToken = pageToken.get(pageId ?? '')
    if (!blocked) {
      for (const accessToken of ownPageToken ? [ownPageToken, token] : [token]) {
        try {
          const form = await getWith<{ name?: string; status?: string; page?: { id?: string; name?: string } }>(id, { fields: 'name,status,page' }, accessToken)
          inventory.leadForms![id] = { id, name: form.name, status: form.status, pageId: form.page?.id ?? pageId, pageName: form.page?.name }
          break
        } catch (error) {
          note(error)
          if (blocked) break
        }
      }
    }
    if (!inventory.leadForms![id]?.name) inventory.leadForms![id] = { id, pageId, nameError: blocked ?? (ownPageToken ? 'Meta no devolvió el nombre del formulario' : NO_PAGE_ACCESS) }
  }
  if (blocked) inventory.formAccessIssue = blocked
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
