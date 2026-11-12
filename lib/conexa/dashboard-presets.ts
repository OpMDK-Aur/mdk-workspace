import { z } from 'zod'

export const DASHBOARD_PLATFORMS = ['meta', 'google', 'analytics', 'tag_manager', 'crm', 'file'] as const
export const DASHBOARD_BLOCK_TYPES = ['kpi', 'line', 'bar', 'funnel', 'table'] as const

export const DASHBOARD_METRIC_CATALOG: Record<string, string[]> = {
  meta: ['Inversión', 'Impresiones', 'Clicks', 'Resultados', 'Leads', 'CPL', 'Costo por resultado'],
  google: ['Inversión', 'Impresiones', 'Clicks', 'Conversiones', 'Costo por conversión'],
  analytics: ['Usuarios', 'Sesiones', 'Eventos', 'Conversiones'],
  tag_manager: ['Etiquetas', 'Activadores', 'Variables'],
  crm: ['Contactos', 'Oportunidades', 'Ventas'],
  file: [],
}

export const DASHBOARD_DIMENSION_CATALOG: Record<string, string[]> = {
  meta: ['campaigns', 'adsets', 'ads', 'byDay'],
  google: ['campaigns', 'adsets', 'ads', 'byDay'],
  analytics: ['overview', 'byPage', 'byDay'],
  tag_manager: [],
  crm: ['contacts', 'opportunities', 'sales'],
  file: ['rows'],
}

export const DASHBOARD_PLATFORM_COLUMN_CATALOG: Record<string, string[]> = {
  meta: ['name', 'campaign_name', 'status', 'spend', 'impressions', 'clicks', 'results', 'conversions', 'leads', 'ctr', 'cpc', 'cpl', 'date'],
  google: ['name', 'campaign_name', 'status', 'spend', 'impressions', 'clicks', 'results', 'conversions', 'ctr', 'cpc', 'cpl', 'date'],
  analytics: ['name', 'date', 'sessions', 'activeUsers', 'eventCount', 'keyEvents'],
  tag_manager: ['name', 'status'],
  crm: ['name', 'status', 'contacts', 'opportunities', 'sales'],
  file: [],
}

export const DASHBOARD_COLUMN_CATALOG = [
  'name', 'campaign_name', 'status', 'spend', 'impressions', 'clicks', 'results',
  'conversions', 'leads', 'ctr', 'cpc', 'cpl', 'date', 'sessions', 'activeUsers',
  'eventCount', 'keyEvents', 'contacts', 'opportunities', 'sales',
] as const

export const DashboardBlockSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(DASHBOARD_BLOCK_TYPES),
  title: z.string().min(1).max(100),
  platform: z.enum(DASHBOARD_PLATFORMS),
  metric: z.string().max(80).nullable(),
  dimension: z.enum(['campaigns', 'adsets', 'ads', 'overview', 'byPage', 'byDay', 'contacts', 'opportunities', 'sales', 'rows']).nullable(),
  columns: z.array(z.string().trim().min(1).max(120)).max(12),
  datasetId: z.string().max(120).nullable(),
  dataSourceName: z.string().max(180).nullable(),
  dataRows: z.array(z.record(z.string(), z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]))).max(1000).nullable(),
})

export const DashboardConfigSchema = z.object({
  version: z.literal(1),
  period: z.string().min(1).max(80),
  useDefaultLayout: z.boolean(),
  hiddenPlatforms: z.array(z.enum(DASHBOARD_PLATFORMS)).max(DASHBOARD_PLATFORMS.length),
  hiddenBlockIds: z.array(z.string().min(1).max(80)).max(16),
  blocks: z.array(DashboardBlockSchema).max(16),
})

const DashboardAssistantBlockSchema = DashboardBlockSchema.extend({
  dataSourceName: z.null(),
  dataRows: z.null(),
})

const DashboardAssistantConfigSchema = DashboardConfigSchema.extend({
  blocks: z.array(DashboardAssistantBlockSchema).max(16),
})

export const DashboardAssistantSchema = z.object({
  kind: z.enum(['answer', 'clarification', 'proposal']),
  text: z.string().min(1).max(3000),
  summary: z.string().max(800).nullable(),
  config: DashboardAssistantConfigSchema.nullable(),
})

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>
export type DashboardBlock = z.infer<typeof DashboardBlockSchema>
export type DashboardPlatformKey = (typeof DASHBOARD_PLATFORMS)[number]

export function normalizeDashboardConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const config = value as Record<string, unknown>
  return {
    ...config,
    useDefaultLayout: config.useDefaultLayout === true,
    hiddenPlatforms: Array.isArray(config.hiddenPlatforms) ? config.hiddenPlatforms : [],
    hiddenBlockIds: Array.isArray(config.hiddenBlockIds) ? config.hiddenBlockIds : [],
    blocks: Array.isArray(config.blocks) ? config.blocks.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value
      const block = value as Record<string, unknown>
      return {
        ...block,
        datasetId: typeof block.datasetId === 'string' ? block.datasetId : null,
        dataSourceName: typeof block.dataSourceName === 'string' ? block.dataSourceName : null,
        dataRows: Array.isArray(block.dataRows) ? block.dataRows : null,
      }
    }) : config.blocks,
  }
}

export type DashboardDatasetCatalog = Record<string, { name: string; columns: string[]; rows: Array<Record<string, unknown>> }>

export function validateDashboardConfig(
  value: unknown,
  metricsByPlatform?: Record<string, Array<{ label: string }>>,
  datasets?: DashboardDatasetCatalog,
) {
  const result = DashboardConfigSchema.safeParse(normalizeDashboardConfig(value))
  if (!result.success) return result
  const blockIds = new Set(result.data.blocks.map((block) => block.id))
  const invalidHiddenBlock = result.data.hiddenBlockIds.find((id) => !blockIds.has(id))
  if (invalidHiddenBlock) {
    return { success: false as const, error: new z.ZodError([{ code: 'custom', path: ['hiddenBlockIds'], message: `El bloque ${invalidHiddenBlock} no existe en este tablero.` }]) }
  }
  const invalidFileBlock = result.data.blocks.find((block) => {
    if (block.platform !== 'file') return block.datasetId !== null || block.dataSourceName !== null || block.dataRows !== null
    if (block.type !== 'table' || !block.datasetId || block.metric !== null || block.dimension !== 'rows') return true
    const dataset = datasets?.[block.datasetId]
    if (!dataset && block.dataRows === null) return true
    const persistedColumns = block.dataRows?.[0] ? Object.keys(block.dataRows[0]) : []
    const availableColumns = dataset?.columns ?? (persistedColumns.length ? persistedColumns : block.columns)
    if (!availableColumns.length || block.columns.length === 0) return true
    return block.columns.some((column) => !availableColumns.includes(column))
  })
  if (invalidFileBlock) {
    return { success: false as const, error: new z.ZodError([{ code: 'custom', path: ['blocks'], message: 'El bloque de archivo debe usar una tabla y columnas incluidas en el archivo.' }]) }
  }
  const invalid = result.data.blocks.find((block) => {
    if (!block.metric || block.platform === 'file') return false
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
  const invalidColumn = result.data.blocks.find((block) => block.platform !== 'file' && block.columns.some((column) => !(DASHBOARD_PLATFORM_COLUMN_CATALOG[block.platform] ?? []).includes(column)))
  if (invalidColumn) {
    return { success: false as const, error: new z.ZodError([{ code: 'custom', path: ['blocks'], message: `Una columna no está disponible para ${invalidColumn.platform}.` }]) }
  }
  return result
}
