import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { ejecutarAlertas } from '@/lib/controller/run-alerts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // tope del plan Hobby (Pro permite hasta 300s)

const MARGEN_MS = 10_000

export async function GET(request: Request) {
  // Verificación del cron secret, igual que el resto de los crons del sistema
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resumen = await ejecutarAlertas(createAdminClient(), { deadline: Date.now() + maxDuration * 1000 - MARGEN_MS })
    if (resumen.evaluadas === 0) return NextResponse.json({ success: true, mensaje: 'No hay alertas activas configuradas.', resumen })
    return NextResponse.json({ success: true, resumen })
  } catch (error) {
    console.error('[cron/controller] Error general:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
