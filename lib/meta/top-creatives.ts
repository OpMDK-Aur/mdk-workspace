import { toCreativeCards, type CreativeCard } from './to-creative-card'

export const CREATIVE_METRICS = ['reach', 'impressions', 'ctr', 'cpl', 'cpc', 'spend', 'leads', 'frequency'] as const
export type CreativeMetric = (typeof CREATIVE_METRICS)[number]
export type CreativeOrder = 'best' | 'worst'

export type RankedCreative = CreativeCard & { rank: number; value: number }
export type TopCreativesStatus = 'ok' | 'empty' | 'inactive' | 'unavailable'
export type TopCreativesResult = { metric: CreativeMetric; order: CreativeOrder; status: TopCreativesStatus; items: RankedCreative[] }

const MIN_IMPRESSIONS = 1000
const LOWER_IS_BETTER: CreativeMetric[] = ['cpl', 'cpc', 'frequency']

function metricValue(card: CreativeCard, metric: CreativeMetric): number | null {
  switch (metric) {
    case 'cpl': return card.leads > 0 ? card.spend / card.leads : null
    case 'cpc': return card.clicks > 0 ? card.spend / card.clicks : null
    case 'frequency': return card.reach > 0 ? card.impressions / card.reach : null
    default: return card[metric]
  }
}

export function rankCreatives(
  metaOutput: Record<string, unknown> | null,
  { metric, order = 'best', limit = 3, campaignName }: { metric: CreativeMetric; order?: CreativeOrder; limit?: number; campaignName?: string },
): TopCreativesResult {
  const base = { metric, order, items: [] as RankedCreative[] }
  if (!metaOutput || metaOutput.available !== true) return { ...base, status: 'unavailable' }
  const accounts = (Array.isArray(metaOutput.accounts) ? metaOutput.accounts : []) as Array<Record<string, unknown>>
  const totalSpend = accounts.reduce((sum, account) => sum + Number((account.totals as { spend?: unknown } | undefined)?.spend ?? 0), 0)
  if (!(totalSpend > 0)) return { ...base, status: 'inactive' }

  const campaignFilter = campaignName?.trim().toLowerCase()
  const direction = (LOWER_IS_BETTER.includes(metric) ? 1 : -1) * (order === 'worst' ? -1 : 1)
  const items = toCreativeCards(accounts)
    .filter((card) => card.impressions >= MIN_IMPRESSIONS)
    .filter((card) => !campaignFilter || card.campaign.toLowerCase().includes(campaignFilter))
    .map((card) => ({ card, value: metricValue(card, metric) }))
    .filter((entry): entry is { card: CreativeCard; value: number } => entry.value !== null && Number.isFinite(entry.value))
    .sort((a, b) => (a.value - b.value) * direction)
    .slice(0, Math.min(Math.max(limit, 1), 6))
    .map(({ card, value }, index) => ({ ...card, rank: index + 1, value }))

  return { ...base, status: items.length ? 'ok' : 'empty', items }
}
