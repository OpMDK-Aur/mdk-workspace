import { NextResponse } from 'next/server'
import { z } from 'zod'
import { copilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { assertClientAccess, discardRecommendation, editRecommendation, prepareRecommendationOperation, publishRecommendation, restoreRecommendation } from '@/lib/conexa/copilot/store'

export const maxDuration = 90
import type { RecommendationDraft } from '@/lib/conexa/copilot/types'

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
  const body = await readJson<{ clientId: string } & RecommendationDraft>(request)
  const { clientId, ...draft } = body
  if (typeof clientId !== 'string' || !clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  const parsed = draftSchema.safeParse(draft)
  if (!parsed.success) return NextResponse.json({ error: 'Completá los campos de la recomendación.' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, clientId)
    return NextResponse.json({ recommendation: await editRecommendation(auth.supabase, clientId, id, parsed.data) })
  } catch (error) { return copilotError(error) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const body = await readJson<{ clientId: string; action: 'prepare' | 'publish' | 'discard' | 'restore'; reason?: string }>(request)
  if (typeof body.clientId !== 'string' || !body.clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  if (!['prepare', 'publish', 'discard', 'restore'].includes(body.action ?? '')) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  if (body.action === 'discard' && body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 1000)) return NextResponse.json({ error: 'El motivo no puede superar los 1000 caracteres.' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, body.clientId)
    if (body.action === 'prepare') return NextResponse.json({ recommendation: await prepareRecommendationOperation(auth.supabase, body.clientId, id) })
    if (body.action === 'publish') return NextResponse.json({ recommendation: await publishRecommendation(auth.supabase, body.clientId, id, auth.user.id) })
    if (body.action === 'discard') return NextResponse.json({ recommendation: await discardRecommendation(auth.supabase, body.clientId, id, auth.user.id, body.reason?.trim() || null) })
    return NextResponse.json({ recommendation: await restoreRecommendation(auth.supabase, body.clientId, id) })
  } catch (error) { return copilotError(error) }
}
