import { NextResponse } from 'next/server'
import { z } from 'zod'
import { buildEntityCatalog } from '@/lib/conexa/copilot/entity-catalog'
import { copilotError, CopilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { assertClientAccess, confirmPublish, discardRecommendation, editRecommendation, getDraft, markManualDone, parseOperation, prepareRecommendationOperation, previewPublish, restoreRecommendation } from '@/lib/conexa/copilot/store'
import type { RecommendationDraft } from '@/lib/conexa/copilot/types'
import { operationDedupeKey, validateOperation } from '@/lib/conexa/copilot/validation'

export const maxDuration = 120

const draftSchema = z.object({
  title: z.string().trim().min(5).max(140),
  platforms: z.array(z.enum(['meta', 'google_ads', 'ga4', 'tag_manager', 'crm'])).max(5),
  type: z.enum(['presupuesto', 'creatividades', 'segmentacion', 'estructura', 'tracking', 'crm', 'otro']),
  priority: z.enum(['alta', 'media', 'baja']),
  description: z.string().trim().min(20).max(900),
  rationale: z.string().trim().min(20).max(1000),
  suggested_actions: z.array(z.string().trim().min(5).max(300)).min(1).max(8),
  expected_impact: z.string().trim().min(5).max(400),
  evidence: z.array(z.object({ id: z.string(), label: z.string(), excerpt: z.string() })).min(1).max(12),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const body = await readJson<{ clientId: string; operation?: unknown } & RecommendationDraft>(request)
  const { clientId, operation, ...draft } = body
  if (typeof clientId !== 'string' || !clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  const parsed = draftSchema.safeParse(draft)
  if (!parsed.success) return NextResponse.json({ error: 'Completá los campos de la recomendación.' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, clientId)
    const patch: RecommendationDraft = parsed.data
    if (operation) {
      const current = await getDraft(auth.supabase, clientId, id)
      const nextOperation = parseOperation(operation)
      if (JSON.stringify(nextOperation) !== JSON.stringify(current.operation)) {
        const { catalog, linkedAccounts } = await buildEntityCatalog(auth.supabase, clientId, { withMetrics: false })
        const errors = validateOperation(nextOperation, catalog, linkedAccounts)
        if (errors.length) throw new CopilotError(errors.join(' '), 422)
      }
      Object.assign(patch, { operation: nextOperation, dedupe_key: operationDedupeKey(nextOperation), non_executable_reason: null })
    }
    return NextResponse.json({ recommendation: await editRecommendation(auth.supabase, clientId, id, patch) })
  } catch (error) { return copilotError(error) }
}

const ACTIONS = ['prepare', 'publish', 'manual_done', 'discard', 'restore'] as const

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const body = await readJson<{ clientId: string; action: (typeof ACTIONS)[number]; reason?: string; confirmedPlanHash?: string }>(request)
  if (typeof body.clientId !== 'string' || !body.clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  if (!ACTIONS.includes(body.action as (typeof ACTIONS)[number])) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  if (body.action === 'discard' && body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 1000)) return NextResponse.json({ error: 'El motivo no puede superar los 1000 caracteres.' }, { status: 400 })
  if (body.confirmedPlanHash !== undefined && (typeof body.confirmedPlanHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.confirmedPlanHash))) return NextResponse.json({ error: 'La confirmación no es válida.' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, body.clientId)
    if (body.action === 'prepare') return NextResponse.json({ recommendation: await prepareRecommendationOperation(auth.supabase, body.clientId, id) })
    if (body.action === 'publish') {
      if (!body.confirmedPlanHash) return NextResponse.json(await previewPublish(auth.supabase, body.clientId, id))
      return NextResponse.json({ recommendation: await confirmPublish(auth.supabase, body.clientId, id, auth.user.id, body.confirmedPlanHash) })
    }
    if (body.action === 'manual_done') return NextResponse.json({ recommendation: await markManualDone(auth.supabase, body.clientId, id, auth.user.id) })
    if (body.action === 'discard') return NextResponse.json({ recommendation: await discardRecommendation(auth.supabase, body.clientId, id, auth.user.id, body.reason?.trim() || null) })
    return NextResponse.json({ recommendation: await restoreRecommendation(auth.supabase, body.clientId, id) })
  } catch (error) { return copilotError(error) }
}
