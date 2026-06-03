import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCachedAdsData, setCachedAdsData } from '@/lib/ads-cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaInsightRow {
  campaign_id: string
  campaign_name: string
  objective: string
  impressions: string
  clicks: string
  spend: string
  ctr: string
  cpc: string
  actions?: Array<{ action_type: string; value: string }>
}

interface MetaPaging {
  cursors?: { before: string; after: string }
  next?: string
}

interface MetaInsightsResponse {
  data: MetaInsightRow[]
  paging?: MetaPaging
  error?: { message: string; type: string; code: number }
}

interface CampaignResult {
  id: string
  name: string
  objective: string
  impressions: number
  clicks: number
  spend: number
  leads: number
  cpl: number
  ctr: number
  cpc: number
  lead_type: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const META_API_VERSION = process.env.META_API_VERSION || 'v25.0'
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`

// ---------------------------------------------------------------------------
// Lead extraction — prioritized action types, no loose heuristics
// ---------------------------------------------------------------------------

const LEAD_ACTION_PRIORITY = [
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'contact',
  'submit_application',
  'complete_registration',
]

function extractLeads(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions || actions.length === 0) return 0
  for (const type of LEAD_ACTION_PRIORITY) {
    const match = actions.find(a => a.action_type === type)
    if (match) return Math.round(parseFloat(match.value) || 0)
  }
  return 0
}

function getLeadType(objective: string, actions: Array<{ action_type: string }> | undefined): string {
  const types = new Set(actions?.map(a => a.action_type) ?? [])
  if (types.has('onsite_conversion.messaging_conversation_started_7d')) return 'Conversacion iniciada'
  if (types.has('lead') || types.has('leadgen_grouped') || types.has('onsite_conversion.lead_grouped')) return 'Lead'
  if (objective === 'OUTCOME_LEADS') return 'Lead'
  if (objective === 'MESSAGES') return 'Conversacion iniciada'
  if (objective === 'OUTCOME_SALES' || objective === 'CONVERSIONS') return 'Conversion'
  return 'Resultado'
}

// ---------------------------------------------------------------------------
// Date ranges — timezone-safe for business dates
// ---------------------------------------------------------------------------

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDateRange(preset: string): { since: string; until: string } {
  const now = new Date()

  switch (preset) {
    case 'last_7d': {
      const start = new Date(now); start.setDate(now.getDate() - 7)
      return { since: localDateString(start), until: localDateString(now) }
    }
    case 'last_14d': {
      const start = new Date(now); start.setDate(now.getDate() - 14)
      return { since: localDateString(start), until: localDateString(now) }
    }
    case 'last_30d': {
      const start = new Date(now); start.setDate(now.getDate() - 30)
      return { since: localDateString(start), until: localDateString(now) }
    }
    case 'daily':
      return { since: localDateString(now), until: localDateString(now) }
    case 'monthly': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { since: localDateString(start), until: localDateString(end) }
    }
    case 'yearly': {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31)
      return { since: localDateString(start), until: localDateString(end) }
    }
    default: {
      const start = new Date(now); start.setDate(now.getDate() - 30)
      return { since: localDateString(start), until: localDateString(now) }
    }
  }
}

// ---------------------------------------------------------------------------
// Fetch active campaign IDs — to filter insights to only active campaigns
// ---------------------------------------------------------------------------

async function fetchActiveCampaignIds(
  accountId: string,
  accessToken: string
): Promise<Set<string>> {
  const activeIds = new Set<string>()
  
  let url: string | null = `${META_BASE_URL}/act_${accountId}/campaigns?${new URLSearchParams({
    access_token: accessToken,
    fields: 'id,effective_status',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: '500',
  })}`

  while (url) {
    const res = await fetch(url)
    if (!res.ok) break
    
    const json = await res.json()
    if (json.error) break
    
    for (const campaign of json.data ?? []) {
      activeIds.add(campaign.id)
    }
    
    url = json.paging?.next ?? null
  }

  return activeIds
}

// ---------------------------------------------------------------------------
// Paginated insights fetch — single endpoint, no N+1
// ---------------------------------------------------------------------------

async function fetchAllInsightPages(
  accountId: string,
  accessToken: string,
  timeRange: { since: string; until: string }
): Promise<MetaInsightRow[]> {
  const fields = 'campaign_id,campaign_name,objective,impressions,clicks,spend,ctr,cpc,actions'
  const rows: MetaInsightRow[] = []

  let url: string | null = `${META_BASE_URL}/act_${accountId}/insights?${new URLSearchParams({
    access_token: accessToken,
    level: 'campaign',
    fields,
    time_range: JSON.stringify(timeRange),
    limit: '500',
  })}`

  while (url) {
    const res = await fetch(url)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Meta API HTTP ${res.status}: ${text.slice(0, 200)}`)
    }

    const json: MetaInsightsResponse = await res.json()

    if (json.error) {
      throw new Error(`Meta API error (${json.error.code}): ${json.error.message}`)
    }

    rows.push(...(json.data ?? []))
    url = json.paging?.next ?? null
  }

  return rows
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

const toNum = (s: string | undefined): number => parseFloat(s || '0') || 0
const toInt = (s: string | undefined): number => Math.round(parseFloat(s || '0')) || 0

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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

    if (!rawAccountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN is not configured' }, { status: 500 })
    }

    // Normalize: always strip act_ — the URL builder adds it
    const accountId = rawAccountId.replace(/^act_/, '')

    // Cache lookup — skip if bust=1
    const bustCache = params.get('bust') === '1'
    if (!bustCache) {
      const cached = await getCachedAdsData('meta', accountId, dateRange, startDate, endDate)
      if (cached) {
        return NextResponse.json({ ...cached, from_cache: true })
      }
    }

    const range = (startDate && endDate)
      ? { since: startDate, until: endDate }
      : getDateRange(dateRange)

    // Single paginated request — no N+1
    let insightRows: MetaInsightRow[]
    let activeCampaignIds: Set<string>
    try {
      // Fetch both in parallel: insights and active campaign IDs
      const [insights, activeIds] = await Promise.all([
        fetchAllInsightPages(accountId, accessToken, range),
        fetchActiveCampaignIds(accountId, accessToken),
      ])
      insightRows = insights
      activeCampaignIds = activeIds
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    // Filter to only active campaigns
    const activeInsightRows = insightRows.filter(row => activeCampaignIds.has(row.campaign_id))

    // Build campaigns from filtered rows
    const campaigns: CampaignResult[] = activeInsightRows.map(row => {
      const spend = toNum(row.spend)
      const leads = extractLeads(row.actions)
      const cpl = leads > 0 && spend > 0 ? spend / leads : 0

      return {
        id: row.campaign_id,
        name: row.campaign_name,
        objective: row.objective,
        impressions: toInt(row.impressions),
        clicks: toInt(row.clicks),
        spend,
        leads,
        cpl,
        ctr: toNum(row.ctr),
        cpc: toNum(row.cpc),
        lead_type: getLeadType(row.objective, row.actions),
      }
    })

    // Totals
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.impressions += c.impressions
        acc.clicks += c.clicks
        acc.spend += c.spend
        acc.leads += c.leads
        return acc
      },
      { impressions: 0, clicks: 0, spend: 0, leads: 0 }
    )

    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    const cpl = totals.leads > 0 ? totals.spend / totals.leads : 0

    // Campaign type distribution by objective
    const objectiveMap: Record<string, { spend: number; leads: number }> = {}
    for (const c of campaigns) {
      const key = c.objective || 'UNKNOWN'
      if (!objectiveMap[key]) objectiveMap[key] = { spend: 0, leads: 0 }
      objectiveMap[key].spend += c.spend
      objectiveMap[key].leads += c.leads
    }

    const campaign_types = Object.entries(objectiveMap)
      .map(([type, data]) => ({
        type,
        spend: data.spend,
        leads: data.leads,
        percentage: totals.spend > 0 ? (data.spend / totals.spend) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend)

    const payload = {
      platform: 'meta' as const,
      account_id: accountId,
      date_range: { start: range.since, end: range.until },
      campaigns,
      campaign_types,
      totals: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        spend: totals.spend,
        leads: totals.leads,
        ctr,
        cpc,
        cpl,
      },
    }

    // Non-blocking cache write
    setCachedAdsData('meta', accountId, dateRange, payload, startDate, endDate)

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error('Meta Ads route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
