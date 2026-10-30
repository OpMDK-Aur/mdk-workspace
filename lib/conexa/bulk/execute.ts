import 'server-only'
import { createAd, MetaPublishError } from '@/lib/meta-ads/publish'
import { act, metaGet, metaPost } from './inventory'
import { findExecutedItem, saveCreativeSources, saveItemResult } from './persistence'
import { sameText } from './text'
import type { ExecuteAdRequest, ExecuteAdResult } from './types'

const ZERO_DECIMAL = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'])
const normalizeAccount = (id: string) => id.replace(/^act_/, '')

class StepError extends Error {
  constructor(message: string, readonly step: string) {
    super(message)
  }
}

async function owner(id: string, step: string) {
  const node = await metaGet<{ account_id?: string; campaign_id?: string; name?: string }>(id, { fields: step === 'conjunto' ? 'account_id,campaign_id,name' : 'account_id,name' })
  if (!node.account_id) throw new StepError(`No pude verificar la cuenta del ${step}.`, step)
  return { accountId: normalizeAccount(node.account_id), campaignId: node.campaign_id, name: node.name ?? '' }
}

async function budgetInMinor(accountId: string, amount: number) {
  const account = await metaGet<{ currency?: string }>(act(accountId), { fields: 'currency' })
  return String(Math.round(amount * (ZERO_DECIMAL.has(account.currency ?? '') ? 1 : 100)))
}

// Antes de crear se vuelve a buscar por nombre exacto: un reintento nunca duplica la campaña ni el conjunto.
async function findByName(edge: string, name: string) {
  const result = await metaGet<{ data?: Array<{ id: string; name?: string }> }>(edge, { fields: 'id,name', limit: '200', filtering: JSON.stringify([{ field: 'name', operator: 'EQUAL', value: name }]) })
  return result.data?.find((item) => sameText(item.name ?? '', name))?.id
}

async function ensureCampaign(accountId: string, spec: ExecuteAdRequest['item']['campaign']) {
  if (spec.mode === 'existing') {
    const node = await owner(spec.id, 'campaña')
    if (node.accountId !== accountId) throw new StepError('La campaña no pertenece a la cuenta indicada.', 'campaña')
    return { id: spec.id, reused: true }
  }
  const found = await findByName(`${act(accountId)}/campaigns`, spec.name)
  if (found) return { id: found, reused: true }
  const reference = await owner(spec.referenceId, 'campaña')
  if (reference.accountId !== accountId) throw new StepError('La campaña de referencia no pertenece a la cuenta.', 'campaña')
  const copy = await metaPost<{ copied_campaign_id?: string }>(`${spec.referenceId}/copies`, { deep_copy: 'false', status_option: 'PAUSED' })
  if (!copy.copied_campaign_id) throw new StepError('Meta no devolvió la campaña copiada.', 'campaña')
  await metaPost(copy.copied_campaign_id, {
    name: spec.name, status: 'PAUSED',
    ...(spec.dailyBudget ? { daily_budget: await budgetInMinor(accountId, spec.dailyBudget) } : {}),
  })
  return { id: copy.copied_campaign_id, reused: false }
}

async function ensureAdset(accountId: string, campaignId: string, spec: ExecuteAdRequest['item']['adset']) {
  if (spec.mode === 'existing') {
    const node = await owner(spec.id, 'conjunto')
    if (node.accountId !== accountId || node.campaignId !== campaignId) throw new StepError('El conjunto no pertenece a la campaña indicada.', 'conjunto')
    return { id: spec.id, reused: true }
  }
  const found = await findByName(`${campaignId}/adsets`, spec.name)
  if (found) return { id: found, reused: true }
  const reference = await owner(spec.referenceId, 'conjunto')
  if (reference.accountId !== accountId) throw new StepError('El conjunto de referencia no pertenece a la cuenta.', 'conjunto')
  const copy = await metaPost<{ copied_adset_id?: string }>(`${spec.referenceId}/copies`, { campaign_id: campaignId, deep_copy: 'false', status_option: 'PAUSED' })
  if (!copy.copied_adset_id) throw new StepError('Meta no devolvió el conjunto copiado.', 'conjunto')
  await metaPost(copy.copied_adset_id, {
    name: spec.name, status: 'PAUSED',
    ...(spec.dailyBudget ? { daily_budget: await budgetInMinor(accountId, spec.dailyBudget) } : {}),
  })
  return { id: copy.copied_adset_id, reused: false }
}

export async function executeAd(request: ExecuteAdRequest, access: { accountIds: Set<string>; pageIds: string[] }): Promise<ExecuteAdResult> {
  const { item } = request
  const accountId = normalizeAccount(item.accountId)
  if (!access.accountIds.has(accountId)) return { itemId: item.id, ok: false, error: 'La cuenta no pertenece a este cliente.', step: 'cuenta' }

  const previous = await findExecutedItem(item.idempotencyKey)
  if (previous) return { ...previous, itemId: item.id }

  let result: ExecuteAdResult
  try {
    const campaign = await ensureCampaign(accountId, item.campaign)
    const adset = await ensureAdset(accountId, campaign.id, item.adset)
    const adsetPage = await metaGet<{ promoted_object?: { page_id?: string } }>(adset.id, { fields: 'promoted_object' })
    if (!access.pageIds.includes(item.ad.pageId) && adsetPage.promoted_object?.page_id !== item.ad.pageId) throw new StepError('La página no está asignada a este cliente.', 'anuncio')
    const existingAd = await findByName(`${adset.id}/ads`, item.ad.name)
    if (existingAd && item.adset.mode === 'create' && adset.reused) {
      result = { itemId: item.id, ok: true, campaignId: campaign.id, adsetId: adset.id, adId: existingAd, creativeId: '', accountId, reused: { campaign: campaign.reused, adset: adset.reused, ad: true } }
    } else {
      const created = await createAd({ adsetId: adset.id, pageId: item.ad.pageId, status: 'PAUSED', name: item.ad.name, primaryText: item.ad.primaryText, headline: item.ad.headline, cta: item.ad.cta, link: item.ad.link, asset: item.ad.asset })
      result = { itemId: item.id, ok: true, campaignId: campaign.id, adsetId: adset.id, adId: created.adId, creativeId: created.creativeId, accountId, reused: { campaign: campaign.reused, adset: adset.reused, ad: false } }
      await saveCreativeSources(item.ad.driveFileIds.map((file) => ({ adAccountId: accountId, adId: created.adId, creativeId: created.creativeId, driveFileId: file.id, driveModifiedTime: file.modifiedTime, format: file.format })))
    }
  } catch (error) {
    const step = error instanceof StepError ? error.step : error instanceof MetaPublishError ? (error as MetaPublishError & { step?: string }).step : undefined
    result = { itemId: item.id, ok: false, error: error instanceof Error ? error.message : 'Error desconocido de Meta', step }
  }
  await saveItemResult(request.planId, item.id, item.rowNumber, item.idempotencyKey, item, result)
  return result
}
