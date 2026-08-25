import { NextResponse } from 'next/server'
import { runDailyPaidMediaSync } from '@/lib/ads/daily-sync'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try { return NextResponse.json(await runDailyPaidMediaSync()) } catch (error) { console.error('[v0] daily paid media sync failed:', error); return NextResponse.json({ error: 'No se pudo ejecutar la sincronización diaria.' }, { status: 500 }) }
}
