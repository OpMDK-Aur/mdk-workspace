import type { NextRequest } from 'next/server'
import { handleGoogleAnalyticsCallback } from '@/lib/google-analytics/oauth-callback'

export async function GET(request: NextRequest) {
  return handleGoogleAnalyticsCallback(request)
}
