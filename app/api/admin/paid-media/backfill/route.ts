import { NextResponse } from 'next/server'
import { runBackfillPaidMedia } from '@/lib/ads/daily-sync'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as { clientId?: string; advertising_account_id?: string; days?: number; dryRun?: boolean }
  const days = Number(body.days ?? 7)
  const dateTo = new Date()
  const dateFrom = new Date(dateTo)
  dateFrom.setUTCDate(dateFrom.getUTCDate() - Math.max(1, Math.floor(days)) + 1)
  try {
    return NextResponse.json(await runBackfillPaidMedia({ clientId: body.clientId, advertisingAccountId: body.advertising_account_id, dateFrom: dateFrom.toISOString().slice(0, 10), dateTo: dateTo.toISOString().slice(0, 10), dryRun: body.dryRun === true }))
  } catch (error) { console.error('[paid-media-backfill] failed:', error); return NextResponse.json({ error: 'No se pudo ejecutar el backfill.', error_code: 'backfill_failed' }, { status: 500 }) }
}
