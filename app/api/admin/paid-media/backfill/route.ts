import { NextResponse } from 'next/server'
import { runBackfillPaidMedia } from '@/lib/ads/daily-sync'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { clientId?: string; accountId?: string; dateFrom?: string; dateTo?: string; dryRun?: boolean }
  try { return NextResponse.json(await runBackfillPaidMedia(body)) } catch (error) { console.error('[v0] paid media backfill failed:', error); return NextResponse.json({ error: 'No se pudo ejecutar el backfill.' }, { status: 500 }) }
}
