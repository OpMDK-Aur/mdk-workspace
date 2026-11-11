import { z } from 'zod'

export const DASHBOARD_PLATFORMS = ['meta', 'google', 'analytics', 'tag_manager', 'crm'] as const
export const DASHBOARD_BLOCK_TYPES = ['kpi', 'line', 'bar', 'funnel', 'table'] as const

export const DASHBOARD_METRIC_CATALOG: Record<string, string[]> = {
  meta: ['Inversión', 'Impresiones', 'Clicks', 'Resultados'],
  google: ['Inversión', 'Impresiones', 'Clicks', 'Conversiones'],
  analytics: ['Usuarios', 'Sesiones', 'Eventos', 'Conversiones'],
  tag_manager: ['Etiquetas', 'Activadores', 'Variables'],
  crm: ['Contactos', 'Oportunidades', 'Ventas'],
}

export const DASHBOARD_DIMENSION_CATALOG: Record<string, string[]> = {
  meta: ['campaigns', 'adsets', 'ads', 'byDay'],
  google: ['campaigns', 'adsets', 'ads', 'byDay'],
  analytics: ['overview', 'byPage', 'byDay'],
  tag_manager: [],
  crm: ['contacts', 'opportunities', 'sales'],
}

export const DASHBOARD_PLATFORM_COLUMN_CATALOG: Record<string, string[]> = {
  meta: ['name', 'campaign_name', 'status', 'spend', 'impressions', 'clicks', 'results', 'conversions', 'ctr', 'cpc', 'cpl', 'date'],
  google: ['name', 'campaign_name', 'status', 'spend', 'impressions', 'clicks', 'results', 'conversions', 'ctr', 'cpc', 'cpl', 'date'],
  analytics: ['name', 'date', 'sessions', 'activeUsers', 'eventCount', 'keyEvents'],
  tag_manager: ['name', 'status'],
  crm: ['name', 'status', 'contacts', 'opportunities', 'sales'],
}

export const DASHBOARD_COLUMN_CATALOG = [
  'name', 'campaign_name', 'status', 'spend', 'impressions', 'clicks', 'results',
  'conversions', 'ctr', 'cpc', 'cpl', 'date', 'sessions', 'activeUsers',
  'eventCount', 'keyEvents', 'contacts', 'opportunities', 'sales',
] as const

export const DashboardBlockSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(DASHBOARD_BLOCK_TYPES),
  title: z.string().min(1).max(100),
  platform: z.enum(DASHBOARD_PLATFORMS),
  metric: z.string().max(80).nullable(),
  dimension: z.enum(['campaigns', 'adsets', 'ads', 'overview', 'byPage', 'byDay', 'contacts', 'opportunities', 'sales']).nullable(),
  columns: z.array(z.enum(DASHBOARD_COLUMN_CATALOG)).max(12),
})

export const DashboardConfigSchema = z.object({
  version: z.literal(1),
  period: z.string().min(1).max(80),
  blocks: z.array(DashboardBlockSchema).max(16),
})

export const DashboardAssistantSchema = z.object({
  kind: z.enum(['answer', 'clarification', 'proposal']),
  text: z.string().min(1).max(3000),
  summary: z.string().max(800).nullable(),
  config: DashboardConfigSchema.nullable(),
})

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>
export type DashboardBlock = z.infer<typeof DashboardBlockSchema>
export type DashboardPlatformKey = (typeof DASHBOARD_PLATFORMS)[number]

export function validateDashboardConfig(value: unknown, metricsByPlatform?: Record<string, Array<{ label: string }>>) {
  const result = DashboardConfigSchema.safeParse(value)
  if (!result.success) return result
  const invalid = result.data.blocks.find((block) => {
    if (!block.metric) return false
    const isInCatalog = (DASHBOARD_METRIC_CATALOG[block.platform] ?? []).includes(block.metric)
    const availableMetrics = metricsByPlatform?.[block.platform]
    const isAvailableNow = !availableMetrics?.length || availableMetrics.some((metric) => metric.label === block.metric)
    return !isInCatalog || !isAvailableNow
  })
  if (invalid) {
    return { success: false as const, error: new z.ZodError([{ code: 'custom', path: ['blocks'], message: `La métrica ${invalid.metric} no está disponible para ${invalid.platform}.` }]) }
  }
  const invalidDimension = result.data.blocks.find((block) => block.dimension && !(DASHBOARD_DIMENSION_CATALOG[block.platform] ?? []).includes(block.dimension))
  if (invalidDimension) {
    return { success: false as const, error: new z.ZodError([{ code: 'custom', path: ['blocks'], message: `La dimensión ${invalidDimension.dimension} no está disponible para ${invalidDimension.platform}.` }]) }
  }
  const invalidColumn = result.data.blocks.find((block) => block.columns.some((column) => !(DASHBOARD_PLATFORM_COLUMN_CATALOG[block.platform] ?? []).includes(column)))
  if (invalidColumn) {
    return { success: false as const, error: new z.ZodError([{ code: 'custom', path: ['blocks'], message: `Una columna no está disponible para ${invalidColumn.platform}.` }]) }
  }
  return result
}
