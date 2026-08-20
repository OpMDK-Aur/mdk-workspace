import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedAdsData, setCachedAdsData } from '@/lib/ads-cache'
import { getMetaAccountMetrics } from '@/lib/meta-ads/service'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = request.nextUrl.searchParams
    const rawAccountId = params.get('account_id')
    const dateRange = params.get('date_range') || 'last_30d'
    const startDate = params.get('start_date') ?? undefined
    const endDate = params.get('end_date') ?? undefined
    if (!rawAccountId) return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    if ((startDate && !endDate) || (!startDate && endDate)) return NextResponse.json({ error: 'start_date and end_date must be provided together' }, { status: 400 })

    const accountId = rawAccountId.replace(/^act_/, '')
    const bustCache = params.get('bust') === '1'
    if (!bustCache) {
      const cached = await getCachedAdsData('meta', accountId, dateRange, startDate, endDate)
      if (cached) return NextResponse.json({ ...cached, from_cache: true })
    }

    const range = startDate && endDate ? { dateFrom: startDate, dateTo: endDate } : (() => {
      const now = new Date()
      const start = new Date(now)
      if (dateRange === 'daily') start.setTime(now.getTime())
      else if (dateRange === 'last_7d') start.setDate(now.getDate() - 7)
      else if (dateRange === 'last_14d') start.setDate(now.getDate() - 14)
      else if (dateRange === 'monthly') return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10) }
      else if (dateRange === 'yearly') return { dateFrom: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), dateTo: new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10) }
      else start.setDate(now.getDate() - 30)
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) }
    })()

    const metrics = await getMetaAccountMetrics({ accountId, dateFrom: range.dateFrom, dateTo: range.dateTo, onlyActiveCampaigns: true })
    const campaignTypes = Object.entries(metrics.results_by_type).map(([type, data]) => ({
      type,
      spend: data.spend,
      leads: data.results,
      percentage: metrics.totals.spend ? (data.spend / metrics.totals.spend) * 100 : 0,
    })).sort((a, b) => b.spend - a.spend)
    const payload = {
      platform: 'meta' as const,
      account_id: metrics.account_id,
      date_range: metrics.date_range,
      campaigns: metrics.campaigns,
      campaign_types: campaignTypes,
      totals: metrics.totals,
    }
    setCachedAdsData('meta', accountId, dateRange, payload, startDate, endDate)
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meta Ads could not respond.'
    console.error('[v0] Meta Ads route error:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
