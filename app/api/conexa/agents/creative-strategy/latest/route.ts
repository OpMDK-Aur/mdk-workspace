import { NextResponse } from 'next/server'
import { loadLatestRun, requireClientAccess } from '@/lib/conexa/agents/strategy-store'

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get('clientId')
  const access = await requireClientAccess(clientId)
  if ('error' in access) return access.error
  const run = await loadLatestRun(access.supabase, access.clientId)
  return NextResponse.json({ run })
}
