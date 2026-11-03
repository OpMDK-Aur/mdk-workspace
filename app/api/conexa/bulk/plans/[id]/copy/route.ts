import { NextResponse } from 'next/server'
import { copyFromCreative, creativeCopyInput } from '@/lib/conexa/bulk/creative-copy'
import { loadPlan } from '@/lib/conexa/bulk/persistence'
import { resolvePlan } from '@/lib/conexa/bulk/resolve'
import { clampText, requireBulkAccess, requireGoogle } from '@/lib/conexa/bulk/route-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

// "Regenerar": vuelve a escribir el copy de un anuncio del plan a partir de su creativo principal.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const access = await requireBulkAccess(body?.clientId)
  if ('error' in access) return access.error
  const plan = await loadPlan(id)
  if (!plan || plan.context.clientId !== access.clientId) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })
  const google = await requireGoogle()
  if ('error' in google) return google.error

  const resolved = resolvePlan(plan.context, plan.overrides)
  const ad = resolved.ads.find((item) => item.id === clampText(body?.planAdId, 500))
  if (!ad) return NextResponse.json({ error: 'El anuncio ya no está en el plan.' }, { status: 404 })
  const input = creativeCopyInput(plan.context, resolved, ad)
  const copy = input ? await copyFromCreative(google.accessToken, plan.context.clientContext ?? '', input) : null
  if (!copy) return NextResponse.json({ error: 'No pude generar el copy a partir del creativo. Completalo a mano.' }, { status: 422 })
  return NextResponse.json(copy)
}
