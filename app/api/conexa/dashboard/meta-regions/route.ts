import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getMetaAccessToken, META_GRAPH_VERSION } from '@/lib/meta-ads/token'
import { normalizeMetaResult, type MetaAction } from '@/lib/meta-ads/service'

export const runtime = 'nodejs'

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function splitIds(values: Array<string | string[] | null | undefined>) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : String(value ?? '').split(',')).map((value) => value.trim().replace(/^act_/, '')).filter((value) => /^\d{1,20}$/.test(value)))]
}

async function getRegionRows(accountId: string, accountName: string | null, token: string, dateFrom: string, dateTo: string) {
  const params = new URLSearchParams({
    access_token: token,
    level: 'campaign',
    breakdowns: 'region',
    fields: 'campaign_id,campaign_name,objective,region,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    limit: '500',
  })
  let nextUrl: string | null = `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${accountId}/insights?${params}`
  const regions = new Map<string, { region: string; account_id: string; account_name: string | null; spend: number; impressions: number; clicks: number; results: number; leads: number }>()
  let pages = 0

  while (nextUrl && pages < 20) {
    const response = await fetch(nextUrl, { cache: 'no-store' })
    const payload = await response.json().catch(() => null) as { data?: Array<Record<string, unknown>>; paging?: { next?: string }; error?: { message?: string } } | null
    if (!response.ok || payload?.error) throw new Error(payload?.error?.message ?? `Meta respondió ${response.status}`)

    for (const row of payload?.data ?? []) {
      const region = typeof row.region === 'string' && row.region.trim() ? row.region.trim() : 'Sin región'
      const key = `${accountId}:${region}`
      const current = regions.get(key) ?? { region, account_id: accountId, account_name: accountName, spend: 0, impressions: 0, clicks: 0, results: 0, leads: 0 }
      const spend = Number(row.spend ?? 0) || 0
      const result = normalizeMetaResult(String(row.objective ?? ''), Array.isArray(row.actions) ? row.actions as MetaAction[] : [])
      current.spend += spend
      current.impressions += Number(row.impressions ?? 0) || 0
      current.clicks += Number(row.clicks ?? 0) || 0
      current.results += result.results
      current.leads += result.leads
      regions.set(key, current)
    }

    nextUrl = payload?.paging?.next ?? null
    pages += 1
  }

  return [...regions.values()]
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { clientId?: string; dateFrom?: string; dateTo?: string }
  if (!body.clientId || !isIsoDate(body.dateFrom) || !isIsoDate(body.dateTo)) {
    return NextResponse.json({ error: 'Falta el cliente o el período.' }, { status: 400 })
  }

  const { data: client, error: clientError } = await supabase
    .from('clientes')
    .select('id, meta_ads_account_id, meta_ads_account_ids')
    .eq('id', body.clientId)
    .maybeSingle()
  if (clientError || !client) return NextResponse.json({ error: 'No tienes acceso a este cliente.' }, { status: 403 })

  const admin = createAdminClient()
  const { data: linkedAccounts } = await admin
    .from('cuentas_publicitarias')
    .select('id_cuenta, nombre_cuenta')
    .eq('cliente_id', body.clientId)
    .eq('plataforma', 'meta')
    .eq('activo', true)

  const accountNameById = new Map<string, string | null>()
  for (const account of linkedAccounts ?? []) {
    for (const id of splitIds([account.id_cuenta])) accountNameById.set(id, account.nombre_cuenta ?? null)
  }
  for (const id of splitIds([client.meta_ads_account_id, client.meta_ads_account_ids])) {
    if (!accountNameById.has(id)) accountNameById.set(id, null)
  }

  const token = await getMetaAccessToken()
  if (!token) return NextResponse.json({ available: false, message: 'Meta Ads no tiene un token configurado.' })
  const accountEntries = [...accountNameById.entries()]
  const results: Array<{ region: string; account_id: string; account_name: string | null; spend: number; impressions: number; clicks: number; results: number; leads: number }> = []
  const errors: Array<{ account_id: string; message: string }> = []

  for (let index = 0; index < accountEntries.length; index += 3) {
    const batch = accountEntries.slice(index, index + 3)
    const batchResults = await Promise.all(batch.map(async ([accountId, accountName]) => {
      try {
        return { rows: await getRegionRows(accountId, accountName, token, body.dateFrom!, body.dateTo!), accountId }
      } catch (cause) {
        return { error: cause instanceof Error ? cause.message : 'No se pudo consultar la región.', accountId }
      }
    }))
    for (const result of batchResults) {
      if ('error' in result) errors.push({ account_id: result.accountId, message: result.error })
      else results.push(...result.rows)
    }
  }

  const grouped = new Map<string, { region: string; spend: number; impressions: number; clicks: number; results: number; leads: number; accounts: Set<string> }>()
  for (const row of results) {
    const current = grouped.get(row.region) ?? { region: row.region, spend: 0, impressions: 0, clicks: 0, results: 0, leads: 0, accounts: new Set<string>() }
    current.spend += row.spend
    current.impressions += row.impressions
    current.clicks += row.clicks
    current.results += row.results
    current.leads += row.leads
    current.accounts.add(row.account_id)
    grouped.set(row.region, current)
  }

  const rows = [...grouped.values()].map((row) => ({
    region: row.region,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    results: row.results,
    leads: row.leads,
    account_count: row.accounts.size,
    cost_per_result: row.results ? row.spend / row.results : 0,
    cost_per_lead: row.leads ? row.spend / row.leads : 0,
    percent_of_results: 0,
    percent_of_leads: 0,
  })).sort((left, right) => right.leads - left.leads)
  const totalResults = rows.reduce((sum, row) => sum + row.results, 0)
  const totalLeads = rows.reduce((sum, row) => sum + row.leads, 0)
  for (const row of rows) {
    row.percent_of_results = totalResults ? (row.results / totalResults) * 100 : 0
    row.percent_of_leads = totalLeads ? (row.leads / totalLeads) * 100 : 0
  }

  return NextResponse.json({ available: rows.length > 0, rows, errors, date_range: { start: body.dateFrom, end: body.dateTo } })
}
