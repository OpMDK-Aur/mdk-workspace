import { NextResponse } from 'next/server'
import { copilotError, readJson, requireUser, type IdParams } from '@/lib/conexa/copilot/route-helpers'
import { rejectRecommendation } from '@/lib/conexa/copilot/store'
import { REJECT_REASONS } from '@/lib/conexa/copilot/types'

export async function POST(request: Request, { params }: IdParams) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const { reason } = await readJson<{ reason: string }>(request)
  if (!REJECT_REASONS.some((item) => item === reason)) return NextResponse.json({ error: 'Razón inválida' }, { status: 400 })
  try {
    return NextResponse.json(rejectRecommendation(id, reason as string, auth.name))
  } catch (cause) {
    return copilotError(cause)
  }
}
