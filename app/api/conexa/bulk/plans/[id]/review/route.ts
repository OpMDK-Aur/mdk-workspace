import { NextResponse } from 'next/server'
import { metaGet, metaPost } from '@/lib/conexa/bulk/inventory'
import { listReviewItems, loadPlan, setReviewStatus, type ReviewStatus } from '@/lib/conexa/bulk/persistence'
import { resolvePlan } from '@/lib/conexa/bulk/resolve'
import { clampText, requireBulkAccess } from '@/lib/conexa/bulk/route-helpers'

export const runtime = 'nodejs'

const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'ok', 'excluded']
const adsManagerUrl = (accountId: string, adId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/ads/edit/standalone?act=${encodeURIComponent(accountId.replace(/^act_/, ''))}&selected_ad_ids=${encodeURIComponent(adId)}`

async function authorize(planId: string, clientId: unknown) {
  const access = await requireBulkAccess(clientId)
  if ('error' in access) return { error: access.error }
  const plan = await loadPlan(planId)
  if (!plan || plan.context.clientId !== access.clientId) return { error: NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 }) }
  return { access, plan }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const found = await authorize(id, new URL(request.url).searchParams.get('clientId'))
  if ('error' in found) return found.error
  const { plan } = found
  const items = await listReviewItems(id)
  const resolved = resolvePlan(plan.context, plan.overrides)

  // Nombre, estado y miniatura salen de Meta: es lo que el equipo va a ver en el Administrador de anuncios.
  const meta: Record<string, { name?: string; effective_status?: string; creative?: { thumbnail_url?: string } }> = {}
  for (let index = 0; index < items.length; index += 50) {
    const ids = items.slice(index, index + 50).map((item) => item.adId).join(',')
    Object.assign(meta, await metaGet<typeof meta>('', { ids, fields: 'name,effective_status,creative.thumbnail_width(160).thumbnail_height(160){thumbnail_url}' }).catch(() => ({})))
  }

  return NextResponse.json({
    items: items.map((item) => {
      const ad = resolved.ads.find((candidate) => candidate.id === item.itemKey)
      const campaign = resolved.campaigns.find((candidate) => candidate.key === ad?.campaignKey)
      const adset = resolved.adsets.find((candidate) => candidate.key === ad?.adsetKey)
      const accountId = item.accountId || ad?.accountId || ''
      return {
        ...item,
        name: meta[item.adId]?.name ?? ad?.name ?? item.adId,
        metaStatus: meta[item.adId]?.effective_status,
        thumbnail: meta[item.adId]?.creative?.thumbnail_url,
        destination: [plan.context.inventory.accounts.find((account) => account.id === accountId)?.name ?? `act_${accountId}`, campaign?.name, adset?.name].filter(Boolean).join(' › '),
        url: accountId ? adsManagerUrl(accountId, item.adId) : null,
      }
    }),
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const found = await authorize(id, body?.clientId)
  if ('error' in found) return found.error
  const status = body?.status as ReviewStatus
  if (!REVIEW_STATUSES.includes(status)) return NextResponse.json({ error: 'Estado de revisión inválido.' }, { status: 400 })
  const items = await listReviewItems(id)
  const item = items.find((candidate) => candidate.idempotencyKey === clampText(body?.idempotencyKey, 200))
  if (!item) return NextResponse.json({ error: 'El anuncio no es de este lote.' }, { status: 404 })

  // Excluir no borra: deja el anuncio en pausa (ya se creó así, pero se asegura por si alguien lo activó).
  if (status === 'excluded') {
    try {
      await metaPost(item.adId, { status: 'PAUSED' })
    } catch (error) {
      return NextResponse.json({ error: `No pude dejar el anuncio en pausa: ${error instanceof Error ? error.message : 'error de Meta'}` }, { status: 502 })
    }
  }
  await setReviewStatus(id, item.idempotencyKey, status, status === 'excluded' ? clampText(body?.note, 500) || null : null, found.access.userId)
  return NextResponse.json({ ok: true })
}
