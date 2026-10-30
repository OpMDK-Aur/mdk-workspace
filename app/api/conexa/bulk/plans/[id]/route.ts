import { NextResponse } from 'next/server'
import { listItemResults, loadPlan, saveAlias, savePlanOverrides } from '@/lib/conexa/bulk/persistence'
import { clampText, requireBulkAccess } from '@/lib/conexa/bulk/route-helpers'
import type { PlanOverrides } from '@/lib/conexa/bulk/types'

export const runtime = 'nodejs'

async function authorizedPlan(id: string, clientId: unknown) {
  const access = await requireBulkAccess(clientId)
  if ('error' in access) return { error: access.error }
  const plan = await loadPlan(id)
  if (!plan || plan.context.clientId !== access.clientId) return { error: NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 }) }
  return { access, plan }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const found = await authorizedPlan(id, new URL(request.url).searchParams.get('clientId'))
  if ('error' in found) return found.error
  return NextResponse.json({ context: found.plan.context, overrides: found.plan.overrides, status: found.plan.status, results: await listItemResults(id) })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const found = await authorizedPlan(id, body?.clientId)
  if ('error' in found) return found.error
  const overrides = (body?.overrides && typeof body.overrides === 'object' ? body.overrides : {}) as PlanOverrides
  if (JSON.stringify(overrides).length > 200_000) return NextResponse.json({ error: 'Demasiados cambios.' }, { status: 413 })
  await savePlanOverrides(id, overrides)

  const alias = clampText(body?.alias?.alias, 200)
  const aliasAccount = clampText(body?.alias?.accountId, 40).replace(/^act_/, '')
  if (alias && aliasAccount) {
    if (!found.access.accountIds.has(aliasAccount)) return NextResponse.json({ error: 'La cuenta no pertenece a este cliente.' }, { status: 403 })
    await saveAlias(found.access.clientId, alias, aliasAccount, found.access.userId)
  }
  return NextResponse.json({ ok: true })
}
