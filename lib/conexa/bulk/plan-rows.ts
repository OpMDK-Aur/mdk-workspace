import { newId } from '@/lib/bulk/group-assets'
import { CTAS, type BulkAsset, type BulkRow, type CTA, type Ratio } from '@/lib/bulk/types'
import { answersForAd, ratioLabel } from './resolve'
import type { DriveFileRef, ExecuteAdRequest, PlanAd, PlanContext, ResolvedPlan } from './types'

export const driveFileUrl = (id: string) => `/api/conexa/meta/bulk/drive-file?id=${encodeURIComponent(id)}`
const isVideo = (file: DriveFileRef) => file.mimeType.startsWith('video/')
const asCta = (value: string): CTA => (CTAS as readonly string[]).find((cta) => cta.toLowerCase() === value.trim().toLowerCase()) as CTA ?? CTAS[0]

export const actingAds = (plan: ResolvedPlan) => {
  const included = new Set(plan.rows.filter((row) => !row.excluded && !row.filteredOut && !row.ignored).map((row) => row.rowNumber))
  return plan.ads.filter((ad) => included.has(ad.rowNumber) && ad.badge !== 'Sin cambios')
}

const toBulkRatio = (format: string): Ratio => (format === '16:9' ? '1.91:1' : ['1:1', '4:5', '9:16', '1.91:1'].includes(format) ? format as Ratio : '1:1')

// Archivos que se publican: los que tienen ubicación asignada. Si no hay asignación, el primero.
export function publishedFiles(ad: PlanAd) {
  const assigned = ad.files.filter((file) => ad.slots?.[file.id]?.length)
  return assigned.length ? assigned : ad.files.slice(0, 1)
}

export function planToRows(plan: ResolvedPlan): BulkRow[] {
  return actingAds(plan).map((ad) => {
    const campaign = plan.campaigns.find((item) => item.key === ad.campaignKey)
    const adset = plan.adsets.find((item) => item.key === ad.adsetKey)
    const assets: BulkAsset[] = ad.files.map((file) => ({
      id: newId('asset'), name: file.name, kind: isVideo(file) ? 'video' : 'image', ratio: toBulkRatio(ratioLabel(file)),
      url: isVideo(file) ? undefined : driveFileUrl(file.id), pending: isVideo(file),
    }))
    return {
      id: newId('row'), baseName: ad.piece, adName: ad.name, assets, adsetId: '', cta: asCta(ad.cta), primaryText: ad.primaryText, headline: ad.headline,
      aiGenerated: ad.aiCopy, planAdId: ad.id, planDestination: {
        accountId: campaign?.accountId, campaignName: campaign?.meta?.name ?? campaign?.name ?? '', campaignId: campaign?.meta?.id ?? campaign?.existingId,
        adsetName: adset?.name ?? '', adsetId: adset?.existingIds?.join(', ') || undefined,
      }, status: 'idle',
    }
  })
}

export function buildExecuteRequest({ context, plan, ad, row, assetUrls }: { context: PlanContext; plan: ResolvedPlan; ad: PlanAd; row: BulkRow; assetUrls: Record<string, string> }): ExecuteAdRequest['item'] | string {
  const campaign = plan.campaigns.find((item) => item.key === ad.campaignKey)
  const adset = plan.adsets.find((item) => item.key === ad.adsetKey)
  if (!campaign || !adset) return 'El destino del anuncio ya no está en el plan.'
  const files = publishedFiles(ad)
  if (!files.length || files.some((file) => !assetUrls[file.id])) return 'Faltan archivos del anuncio.'
  const pageId = adset.pageId ?? context.pageIds[0]
  if (!pageId) return 'No hay página de Facebook para el anuncio.'
  let campaignSpec: ExecuteAdRequest['item']['campaign']
  if (campaign.mode === 'existing' && campaign.existingId) campaignSpec = { mode: 'existing', id: campaign.existingId }
  else if (campaign.reference) campaignSpec = { mode: 'create', key: campaign.key, name: campaign.name, referenceId: campaign.reference.id, dailyBudget: campaign.dailyBudget }
  else return 'Falta la campaña de referencia.'
  let adsetSpec: ExecuteAdRequest['item']['adset']
  if (adset.mode === 'existing' && adset.existingIds[0]) adsetSpec = { mode: 'existing', id: adset.existingIds.find((id) => ad.adsetKey.endsWith(id)) ?? adset.existingIds[0] }
  else if (adset.reference) adsetSpec = { mode: 'create', key: adset.key, name: adset.name, referenceId: adset.reference.id, dailyBudget: adset.dailyBudget }
  else return 'Falta el conjunto de referencia.'
  return {
    id: ad.id, rowNumber: ad.rowNumber, idempotencyKey: ad.idempotencyKey, accountId: ad.accountId, answers: answersForAd(plan, ad), campaign: campaignSpec, adset: adsetSpec,
    ad: {
      name: row.adName || ad.name, primaryText: row.primaryText, headline: row.headline, cta: row.cta, link: ad.url, pageId, leadFormId: ad.leadFormId,
      assets: files.map((file) => ({ url: assetUrls[file.id], kind: isVideo(file) ? 'video' : 'image', name: file.name, slots: ad.slots?.[file.id] ?? ['feed', 'vertical', 'other'] })),
      driveFileIds: files.map((item) => ({ id: item.id, modifiedTime: item.modifiedTime, format: ratioLabel(item) })),
    },
  }
}
