import { z } from 'zod'

export const CLIENT_MEMORY_FIELDS = ['industry', 'commercial_objective', 'product_type'] as const
export const CLIENT_MEMORY_ALL_FIELDS = [...CLIENT_MEMORY_FIELDS, 'primary_conversion_type'] as const

const AggregateSchema = z.object({ spend: z.number(), leads: z.number(), conversions: z.number(), cpl: z.number().nullable() })
const Performance90dSchema = z.object({
  available: z.boolean(),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  coverage: z.object({ expected_days: z.literal(90), first_date: z.string().nullable(), last_date: z.string().nullable(), observed_days: z.number(), coverage_ratio: z.number() }),
  platforms: z.array(z.string()),
  campaign_types: z.array(z.string()),
  campaign_objectives: z.array(z.string()),
  result_types: z.array(z.string()),
  currencies: z.array(z.string()),
  cpl: z.object({ available: z.boolean(), total_90d: z.number().nullable(), total_spend: z.number().nullable(), total_leads: z.number().nullable(), by_month: z.array(z.object({ month: z.string(), spend: z.number(), leads: z.number(), cpl: z.number().nullable() })), by_platform: z.record(z.string(), AggregateSchema), by_currency: z.record(z.string(), AggregateSchema) }),
  conversions: z.object({ available: z.boolean(), total_90d: z.number(), average_daily: z.number(), daily: z.array(z.object({ date: z.string(), conversions: z.number() })), monthly: z.array(z.object({ month: z.string(), conversions: z.number() })) }),
  by_platform: z.record(z.string(), z.object({ spend: z.number(), leads: z.number(), conversions: z.number(), campaign_types: z.array(z.string()) })),
  error: z.string().optional(),
})

export const ClientMemorySchema = z.object({
  profile: z.object({ industry: z.string().nullable(), commercial_objective: z.string().nullable(), product_type: z.string().nullable(), primary_conversion_type: z.string().nullable() }),
  sources: z.object({ industry: z.string().nullable(), commercial_objective: z.string().nullable(), product_type: z.string().nullable(), primary_conversion_type: z.string().nullable() }),
  missing_fields: z.array(z.enum(CLIENT_MEMORY_FIELDS)),
  completeness: z.enum(['complete', 'partial', 'empty']),
  performance_90d: Performance90dSchema,
})

export type ClientMemory = z.infer<typeof ClientMemorySchema>
export type ClientMemoryField = typeof CLIENT_MEMORY_ALL_FIELDS[number]

export function emptyPerformance90d(): ClientMemory['performance_90d'] {
  return { available: false, date_from: null, date_to: null, coverage: { expected_days: 90, first_date: null, last_date: null, observed_days: 0, coverage_ratio: 0 }, platforms: [], campaign_types: [], campaign_objectives: [], result_types: [], currencies: [], cpl: { available: false, total_90d: null, total_spend: null, total_leads: null, by_month: [], by_platform: {}, by_currency: {} }, conversions: { available: false, total_90d: 0, average_daily: 0, daily: [], monthly: [] }, by_platform: {} }
}

export function emptyClientMemory(): ClientMemory {
  return { profile: { industry: null, commercial_objective: null, product_type: null, primary_conversion_type: null }, sources: { industry: null, commercial_objective: null, product_type: null, primary_conversion_type: null }, missing_fields: [...CLIENT_MEMORY_FIELDS], completeness: 'empty', performance_90d: emptyPerformance90d() }
}

export function normalizeIndustry(value: string) { return value.trim().toLowerCase().replace(/\s+/g, '_') }

export function buildClientMemory(row?: Record<string, unknown> | null, performance_90d = emptyPerformance90d()): ClientMemory {
  const profile = { industry: typeof row?.industry === 'string' ? row.industry : null, commercial_objective: typeof row?.commercial_objective === 'string' ? row.commercial_objective : null, product_type: typeof row?.product_type === 'string' ? row.product_type : null, primary_conversion_type: typeof row?.primary_conversion_type === 'string' ? row.primary_conversion_type : null }
  const sources = { industry: typeof row?.industry_source === 'string' ? row.industry_source : null, commercial_objective: typeof row?.commercial_objective_source === 'string' ? row.commercial_objective_source : null, product_type: typeof row?.product_type_source === 'string' ? row.product_type_source : null, primary_conversion_type: typeof row?.primary_conversion_source === 'string' ? row.primary_conversion_source : null }
  const missing_fields = CLIENT_MEMORY_FIELDS.filter((field) => !profile[field])
  return { profile, sources, missing_fields, completeness: missing_fields.length === CLIENT_MEMORY_FIELDS.length ? 'empty' : missing_fields.length ? 'partial' : 'complete', performance_90d }
}

type MetricRow = { platform: string | null; metric_date: string | null; campaign_type: string | null; campaign_objective: string | null; result_type: string | null; currency: string | null; spend: number | string | null; leads: number | string | null; conversions: number | string | null }
const num = (value: unknown) => typeof value === 'number' ? value : Number(value ?? 0) || 0
const unique = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))]

export function buildPerformance90d(rows: MetricRow[], today = new Date()): ClientMemory['performance_90d'] {
  const dateTo = today.toISOString().slice(0, 10)
  const fromDate = new Date(today); fromDate.setUTCDate(fromDate.getUTCDate() - 89)
  const dateFrom = fromDate.toISOString().slice(0, 10)
  const observed = rows.filter((row) => row.metric_date && row.metric_date >= dateFrom && row.metric_date <= dateTo)
  if (!observed.length) return { ...emptyPerformance90d(), date_from: dateFrom, date_to: dateTo }
  const coverageDates = unique(observed.map((row) => row.metric_date)).sort()
  const aggregate = (items: MetricRow[], leadOnly: boolean) => { const spend = items.reduce((sum, row) => sum + num(row.spend), 0); const leads = items.reduce((sum, row) => sum + (leadOnly ? (row.result_type?.toLowerCase().includes('lead') ? num(row.leads) : 0) : num(row.leads)), 0); return { spend, leads, conversions: items.reduce((sum, row) => sum + num(row.conversions), 0), cpl: leads > 0 ? spend / leads : null } }
  const leadRows = observed.filter((row) => row.result_type?.toLowerCase().includes('lead') && num(row.leads) > 0)
  const byMonth = [...new Set(leadRows.map((row) => row.metric_date!.slice(0, 7)))].sort().map((month) => ({ month, ...aggregate(leadRows.filter((row) => row.metric_date!.startsWith(month)), true) }))
  const byCurrency = Object.fromEntries(unique(leadRows.map((row) => row.currency)).map((currency) => [currency, aggregate(leadRows.filter((row) => row.currency === currency), true)]))
  const byPlatformCpl = Object.fromEntries(unique(leadRows.map((row) => row.platform)).map((platform) => [platform, aggregate(leadRows.filter((row) => row.platform === platform), true)]))
  const conversionRows = observed.filter((row) => num(row.conversions) !== 0)
  const grouped = (keyOf: (row: MetricRow) => string) => conversionRows.reduce<Record<string, MetricRow[]>>((groups, row) => { const key = keyOf(row); (groups[key] ??= []).push(row); return groups }, {})
  const daily = Object.entries(grouped((row) => row.metric_date!)).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, conversions: items.reduce((sum, row) => sum + num(row.conversions), 0) }))
  const monthly = Object.entries(grouped((row) => row.metric_date!.slice(0, 7))).sort(([a], [b]) => a.localeCompare(b)).map(([month, items]) => ({ month, conversions: items.reduce((sum, row) => sum + num(row.conversions), 0) }))
  const platforms = unique(observed.map((row) => row.platform))
  const byPlatform = Object.fromEntries(platforms.map((platform) => { const items = observed.filter((row) => row.platform === platform); return [platform, { spend: items.reduce((s, r) => s + num(r.spend), 0), leads: leadRows.filter((r) => r.platform === platform).reduce((s, r) => s + num(r.leads), 0), conversions: items.reduce((s, r) => s + num(r.conversions), 0), campaign_types: unique(items.map((r) => r.campaign_type)) }] }))
  return { available: true, date_from: dateFrom, date_to: dateTo, platforms, campaign_types: unique(observed.map((r) => r.campaign_type)), campaign_objectives: unique(observed.map((r) => r.campaign_objective)), result_types: unique(observed.map((r) => r.result_type)), currencies: unique(observed.map((r) => r.currency)), coverage: { expected_days: 90, first_date: coverageDates[0], last_date: coverageDates.at(-1)!, observed_days: coverageDates.length, coverage_ratio: coverageDates.length / 90 }, cpl: { available: leadRows.length > 0, total_90d: leadRows.length ? aggregate(leadRows, true).cpl : null, total_spend: leadRows.length ? aggregate(leadRows, true).spend : null, total_leads: leadRows.length ? aggregate(leadRows, true).leads : null, by_month: byMonth.map(({ month, spend, leads, cpl }) => ({ month, spend, leads, cpl })), by_platform: byPlatformCpl, by_currency: byCurrency }, conversions: { available: conversionRows.length > 0, total_90d: conversionRows.reduce((s, r) => s + num(r.conversions), 0), average_daily: conversionRows.reduce((s, r) => s + num(r.conversions), 0) / 90, daily, monthly }, by_platform: byPlatform }
}

export type { MetricRow }
