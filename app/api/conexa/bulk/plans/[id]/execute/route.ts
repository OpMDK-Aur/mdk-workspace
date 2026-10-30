import { NextResponse } from 'next/server'
import { isAllowedAssetUrl } from '@/lib/meta-ads/bulk-access'
import { executeAd } from '@/lib/conexa/bulk/execute'
import { loadPlan, markPlanApproved } from '@/lib/conexa/bulk/persistence'
import { resolvePlan } from '@/lib/conexa/bulk/resolve'
import { requireBulkAccess } from '@/lib/conexa/bulk/route-helpers'
import type { ExecuteAdRequest } from '@/lib/conexa/bulk/types'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null) as ExecuteAdRequest | null
  if (!body?.item || body.confirmed !== true) return NextResponse.json({ error: 'Falta la aprobación explícita del plan.' }, { status: 400 })
  const access = await requireBulkAccess(body.clientId)
  if ('error' in access) return access.error
  const plan = await loadPlan(id)
  if (!plan || plan.context.clientId !== access.clientId) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })

  // El servidor recalcula el plan aprobado: solo ejecuta anuncios que existen en él y no están bloqueados.
  const resolved = resolvePlan(plan.context, plan.overrides)
  const planned = resolved.ads.find((ad) => ad.id === body.item.id)
  if (!planned || planned.idempotencyKey !== body.item.idempotencyKey) return NextResponse.json({ error: 'El anuncio no coincide con el plan aprobado. Regenerá el plan.' }, { status: 409 })
  if (planned.state === 'blocked') return NextResponse.json({ error: 'El anuncio todavía tiene datos faltantes.' }, { status: 400 })
  if (!isAllowedAssetUrl(body.item.ad.asset?.url ?? '') || !['image', 'video'].includes(body.item.ad.asset?.kind)) return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 })
  if (!body.item.ad.name?.trim() || !body.item.ad.primaryText?.trim() || !body.item.ad.headline?.trim()) return NextResponse.json({ error: 'Faltan nombre, texto principal o título.' }, { status: 400 })

  await markPlanApproved(id, access.userId)
  const result = await executeAd({ ...body, planId: id }, { accountIds: access.accountIds, pageIds: access.pageIds })
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
