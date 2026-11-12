import { NextResponse } from 'next/server'
import { copilotError, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { assertClientAccess, listRecommendations } from '@/lib/conexa/copilot/store'
import { RECOMMENDATION_STATUSES, type RecommendationStatus } from '@/lib/conexa/copilot/types'

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const params = new URL(request.url).searchParams
  const clientId = params.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  const statusValue = params.get('status')
  const status = RECOMMENDATION_STATUSES.find((item) => item === statusValue) as RecommendationStatus | undefined
  if (statusValue && !status) return NextResponse.json({ error: 'Filtro de estado inválido' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, clientId)
    return NextResponse.json({ recommendations: await listRecommendations(auth.supabase, clientId, status) })
  } catch (error) { return copilotError(error) }
}
