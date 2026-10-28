import { NextResponse } from 'next/server'
import { copilotError, readJson, requireUser, type IdParams } from '@/lib/conexa/copilot/route-helpers'
import { approveRecommendation } from '@/lib/conexa/copilot/store'

export async function POST(request: Request, { params }: IdParams) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const { mode, slot } = await readJson<{ mode: 'now' | 'schedule'; slot: string }>(request)
  if (mode !== 'now' && mode !== 'schedule') return NextResponse.json({ error: 'Modo inválido' }, { status: 400 })
  if (slot !== undefined && (typeof slot !== 'string' || slot.length > 80)) return NextResponse.json({ error: 'Horario inválido' }, { status: 400 })
  try {
    return NextResponse.json(await approveRecommendation(id, mode, auth.name, slot))
  } catch (cause) {
    return copilotError(cause)
  }
}
