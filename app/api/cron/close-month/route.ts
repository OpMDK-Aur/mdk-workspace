import { NextResponse } from 'next/server'
import { closeMonthServiceMap } from '@/lib/service-map'

export const dynamic = 'force-dynamic'

/**
 * Cron job to close the previous month's service map
 * Runs on the 1st of each month at 00:05 UTC
 * Marks all pending/in_course instances as 'no_realizado'
 * and cancels associated pending tasks
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret for security (optional but recommended)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Calculate previous month
    const now = new Date()
    let mes = now.getMonth() // 0-indexed, so this gives us the previous month
    let anio = now.getFullYear()
    
    // Handle January case (previous month would be December of previous year)
    if (mes === 0) {
      mes = 12
      anio = anio - 1
    }

    console.log(`[cron/close-month] Closing month ${mes}/${anio}`)

    const result = await closeMonthServiceMap(mes, anio)

    if (!result.success) {
      console.error('[cron/close-month] Error:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log(
      `[cron/close-month] Success: ${result.clientsClosed} clients, ${result.instancesClosed} instances closed`
    )

    return NextResponse.json({
      success: true,
      month: mes,
      year: anio,
      clientsClosed: result.clientsClosed,
      instancesClosed: result.instancesClosed,
    })
  } catch (error) {
    console.error('[cron/close-month] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
