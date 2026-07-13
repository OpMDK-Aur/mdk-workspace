/**
 * Google Ads query builder helpers.
 * All GAQL construction lives here — no ad-hoc query strings in route handlers.
 */

import { CHANNEL_TYPE_LABELS, getAllowedFields, type ResourceName } from './config'

// ---------------------------------------------------------------------------
// Date helpers (local timezone, no UTC drift)
// ---------------------------------------------------------------------------
function pad(n: number): string { return String(n).padStart(2, '0') }

// Google Ads GAQL requires ISO format yyyy-MM-dd for segments.date literals
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function buildDateFilter(
  dateRange: string,
  startDate?: string,
  endDate?: string
): { clause: string; start: string; end: string } {
  if (startDate && endDate) {
    return { clause: `segments.date BETWEEN '${startDate}' AND '${endDate}'`, start: startDate, end: endDate }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Note: new Date(today) works correctly here because 'today' is already a Date object, not a string.
  // The timezone bug only affects string dates like "2026-06-01", not Date object instances.
  const offset = (days: number) => { const d = new Date(today); d.setDate(today.getDate() - days); return d }

  switch (dateRange) {
    case 'last_7d':  { const s = offset(7);  return { clause: `segments.date BETWEEN '${toIso(s)}' AND '${toIso(today)}'`, start: toIso(s), end: toIso(today) } }
    case 'last_14d': { const s = offset(14); return { clause: `segments.date BETWEEN '${toIso(s)}' AND '${toIso(today)}'`, start: toIso(s), end: toIso(today) } }
    case 'daily':    { return { clause: `segments.date = '${toIso(today)}'`, start: toIso(today), end: toIso(today) } }
    case 'monthly':  { const s = new Date(today.getFullYear(), today.getMonth(), 1); const e = new Date(today.getFullYear(), today.getMonth() + 1, 0); return { clause: `segments.date BETWEEN '${toIso(s)}' AND '${toIso(e)}'`, start: toIso(s), end: toIso(e) } }
    case 'yearly':   { const s = new Date(today.getFullYear(), 0, 1); const e = new Date(today.getFullYear(), 11, 31); return { clause: `segments.date BETWEEN '${toIso(s)}' AND '${toIso(e)}'`, start: toIso(s), end: toIso(e) } }
    default: { const s = offset(30); return { clause: `segments.date BETWEEN '${toIso(s)}' AND '${toIso(today)}'`, start: toIso(s), end: toIso(today) } }
  }
}

// ---------------------------------------------------------------------------
// Column sanitizer — removes columns not valid for the chosen resource
// ---------------------------------------------------------------------------
export function sanitizeColumns(columns: string[], resource: ResourceName): string[] {
  const allowed = getAllowedFields(resource)
  return columns.filter(c => allowed.has(c))
}

// ---------------------------------------------------------------------------
// GAQL query builder
// ---------------------------------------------------------------------------
export interface GaqlOptions {
  resource: ResourceName
  columns: string[]         // already sanitized
  dateClause: string
  campaignType?: string
  campaignStatus?: string
  keyword?: string
  conversionActionName?: string
  limit?: number
}

export function buildGaqlQuery(opts: GaqlOptions): string {
  const { resource, columns, dateClause, campaignType, campaignStatus, keyword, conversionActionName, limit } = opts

  const where: string[] = [dateClause]

  // Resource-specific base filters
  if (resource === 'campaign' || resource === 'ad_group_ad') {
    where.push("campaign.status != 'REMOVED'")
  }

  if (campaignType) {
    where.push(`campaign.advertising_channel_type = '${campaignType.replace(/'/g, "\\'")}'`)
  }
  if (campaignStatus) {
    where.push(`campaign.status = '${campaignStatus.replace(/'/g, "\\'")}'`)
  }
  if (keyword && (resource === 'keyword_view' || resource === 'ad_group_ad')) {
    where.push(`ad_group_criterion.keyword.text LIKE '%${keyword.replace(/'/g, "\\'")}%'`)
  }
  if (conversionActionName && resource === 'ad_group_ad') {
    where.push(`segments.conversion_action_name = '${conversionActionName.replace(/'/g, "\\'")}'`)
  }

  // Always include segments.date in SELECT when the date clause uses it,
  // to avoid "segment not in SELECT" errors
  const selectColumns = columns.includes('segments.date') ? columns : [...columns, 'segments.date']

  const selectClause = selectColumns.join(',\n        ')
  const whereClause  = where.join('\n        AND ')
  const limitClause  = limit ? `\n      LIMIT ${limit}` : ''

  return `
    SELECT
        ${selectClause}
    FROM ${resource}
    WHERE ${whereClause}
    ORDER BY metrics.cost_micros DESC${limitClause}
  `.trim()
}

// ---------------------------------------------------------------------------
// Fetch with pagination
// ---------------------------------------------------------------------------
const GOOGLE_ADS_API_VERSION = 'v23'
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchGaqlRows(
  customerId: string,
  query: string,
  headers: HeadersInit
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ rows: Record<string, any>[]; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = []
  let pageToken: string | undefined = undefined

  do {
    const body: Record<string, string> = { query }
    if (pageToken) body.pageToken = pageToken

    const url = `${GOOGLE_ADS_BASE_URL}/customers/${customerId}/googleAds:search`
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any
    try {
      json = await res.clone().json()
    } catch {
      const text = await res.text().catch(() => '(unreadable)')
      return { rows, error: `Google Ads API HTTP ${res.status}: ${text.slice(0, 300)}` }
    }

    if (!res.ok || json.error) {
      const detail = json.error?.details?.[0]?.errors?.[0]?.message
        ?? json.error?.message
        ?? `HTTP ${res.status}`
      return { rows, error: detail }
    }

    if (Array.isArray(json.results)) rows.push(...json.results)
    pageToken = json.nextPageToken
  } while (pageToken)

  return { rows, error: null }
}

// ---------------------------------------------------------------------------
// Row normalizer — resolves nested paths & formats values
// ---------------------------------------------------------------------------

/** Reads a nested path like "metrics.cost_micros" from a raw API row */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNestedValue(obj: Record<string, any>, path: string): unknown {
  // Google Ads REST API returns camelCase keys — convert snake_case path to camelCase
  const camelPath = path.replace(/_([a-z])/g, (_, l) => l.toUpperCase())
  const snakeParts = path.split('.')
  const camelParts = camelPath.split('.')

  // Try snake_case first, then camelCase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let snakeVal: any = obj
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let camelVal: any = obj
  for (let i = 0; i < snakeParts.length; i++) {
    snakeVal = snakeVal?.[snakeParts[i]]
    camelVal = camelVal?.[camelParts[i]]
  }
  return snakeVal ?? camelVal ?? null
}

/** Normalize a single raw row into a flat, typed record */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeRow(raw: Record<string, any>, columns: string[]): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = { _raw: raw }

  for (const col of columns) {
    result[col] = getNestedValue(raw, col)
  }

  // Normalized helpers
  const costMicros = Number(result['metrics.cost_micros'] ?? 0)
  const budgetMicros = Number(result['campaign_budget.amount_micros'] ?? 0)
  const chanType = String(result['campaign.advertising_channel_type'] ?? '')

  if (columns.includes('metrics.cost_micros')) {
    result['_spend'] = Math.round((costMicros / 1_000_000) * 100) / 100
  }
  if (columns.includes('campaign_budget.amount_micros')) {
    result['_budget'] = Math.round((budgetMicros / 1_000_000) * 100) / 100
  }
  if (columns.includes('campaign.advertising_channel_type') && chanType) {
    result['_channel_label'] = CHANNEL_TYPE_LABELS[chanType] ?? chanType
  }

  return result
}
