import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/conexa/copilot/route-helpers'
import { listRecommendations } from '@/lib/conexa/copilot/store'
import type { RecommendationStatus } from '@/lib/conexa/copilot/types'

const STATUSES: RecommendationStatus[] = ['pending', 'executing', 'executed', 'scheduled', 'rejected']

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const params = new URL(request.url).searchParams
  const clientId = params.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  const status = STATUSES.find((item) => item === params.get('status'))
  return NextResponse.json(listRecommendations(clientId, status))
}
