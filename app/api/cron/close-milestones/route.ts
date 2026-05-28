import { closeExpiredMilestones } from '@/lib/service-map'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for this job

/**
 * Cron job to close expired milestones from previous months
 * Should run on the 1st of each month at 00:05 UTC
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/close-milestones",
 *     "schedule": "5 0 1 * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret for security (optional but recommended)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // If CRON_SECRET is set, require it for authentication
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[cron] Starting close-milestones job...')
    
    const result = await closeExpiredMilestones()
    
    if (!result.success) {
      console.error('[cron] close-milestones failed:', result.error)
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 })
    }

    console.log(`[cron] close-milestones completed: ${result.closed} milestones closed`)
    
    return NextResponse.json({ 
      success: true, 
      closed: result.closed,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[cron] Unexpected error in close-milestones:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Also allow POST for manual triggering
export async function POST(request: Request) {
  return GET(request)
}
