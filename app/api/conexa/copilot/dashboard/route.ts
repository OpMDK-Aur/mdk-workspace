import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/conexa/copilot/route-helpers'
import { dashboard } from '@/lib/conexa/copilot/store'
import type { CopilotPlatform, DashboardRange } from '@/lib/conexa/copilot/types'

const PLATFORMS: CopilotPlatform[] = ['meta', 'google-ads', 'crm', 'tracking']
const RANGES: DashboardRange[] = ['7', '30', '90']

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const params = new URL(request.url).searchParams
  const clientId = params.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  return NextResponse.json(dashboard(clientId, {
    type: params.get('type') || undefined,
    platform: PLATFORMS.find((item) => item === params.get('platform')) ?? '',
    range: RANGES.find((item) => item === params.get('range')) ?? '30',
    by: params.get('by') || undefined,
  }))
}
