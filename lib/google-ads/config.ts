/**
 * Google Ads GAQL resource definitions.
 * Each entry defines which columns are valid for that resource.
 *
 * IMPORTANT: segments.conversion_action_name is NOT compatible with
 * metrics.clicks / cost_micros / impressions on the `campaign` resource.
 * It IS compatible on `ad_group_ad`.
 */

export type ResourceName = 'campaign' | 'ad_group_ad' | 'keyword_view'

export interface ColumnDef {
  /** GAQL field path, e.g. "metrics.clicks" */
  field: string
  /** Human-readable label */
  label: string
  /** Column category for grouping in UI */
  category: 'dimension' | 'metric' | 'segment'
  /** Whether to include in default selection */
  default?: boolean
  /** Format hint for UI rendering */
  format?: 'number' | 'currency' | 'percent' | 'text' | 'status'
}

// ---------------------------------------------------------------------------
// Column definitions per resource
// ---------------------------------------------------------------------------

const CAMPAIGN_COLUMNS: ColumnDef[] = [
  { field: 'campaign.id',                         label: 'ID',               category: 'dimension', format: 'text' },
  { field: 'campaign.name',                       label: 'Campaña',          category: 'dimension', format: 'text',     default: true },
  { field: 'campaign.status',                     label: 'Estado',           category: 'dimension', format: 'status',   default: true },
  { field: 'campaign.advertising_channel_type',   label: 'Tipo',             category: 'dimension', format: 'text',     default: true },
  { field: 'campaign_budget.amount_micros',       label: 'Presupuesto',      category: 'dimension', format: 'currency', default: true },
  { field: 'metrics.impressions',                 label: 'Impresiones',      category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.clicks',                      label: 'Clicks',           category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.cost_micros',                 label: 'Inversión',        category: 'metric',    format: 'currency', default: true },
  { field: 'metrics.ctr',                         label: 'CTR',              category: 'metric',    format: 'percent' },
  { field: 'metrics.average_cpc',                 label: 'CPC promedio',     category: 'metric',    format: 'currency' },
  { field: 'metrics.conversions',                 label: 'Conversiones',     category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.conversions_value',           label: 'Valor conv.',      category: 'metric',    format: 'currency' },
  { field: 'metrics.all_conversions',             label: 'Todas las conv.',  category: 'metric',    format: 'number' },
  { field: 'segments.date',                       label: 'Fecha',            category: 'segment',   format: 'text' },
]

const AD_GROUP_AD_COLUMNS: ColumnDef[] = [
  { field: 'campaign.id',                         label: 'ID campaña',       category: 'dimension', format: 'text' },
  { field: 'campaign.name',                       label: 'Campaña',          category: 'dimension', format: 'text',     default: true },
  { field: 'campaign.status',                     label: 'Estado campaña',   category: 'dimension', format: 'status' },
  { field: 'campaign.advertising_channel_type',   label: 'Tipo',             category: 'dimension', format: 'text' },
  { field: 'ad_group.id',                         label: 'ID grupo',         category: 'dimension', format: 'text' },
  { field: 'ad_group.name',                       label: 'Grupo de anuncio', category: 'dimension', format: 'text',     default: true },
  { field: 'ad_group_ad.ad.id',                   label: 'ID anuncio',       category: 'dimension', format: 'text' },
  { field: 'ad_group_ad.ad.name',                 label: 'Anuncio',          category: 'dimension', format: 'text' },
  { field: 'metrics.impressions',                 label: 'Impresiones',      category: 'metric',    format: 'number' },
  { field: 'metrics.clicks',                      label: 'Clicks',           category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.cost_micros',                 label: 'Inversión',        category: 'metric',    format: 'currency', default: true },
  { field: 'metrics.ctr',                         label: 'CTR',              category: 'metric',    format: 'percent' },
  { field: 'metrics.average_cpc',                 label: 'CPC promedio',     category: 'metric',    format: 'currency' },
  { field: 'metrics.conversions',                 label: 'Conversiones',     category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.conversions_value',           label: 'Valor conv.',      category: 'metric',    format: 'currency' },
  { field: 'metrics.all_conversions',             label: 'Todas las conv.',  category: 'metric',    format: 'number' },
  { field: 'segments.date',                       label: 'Fecha',            category: 'segment',   format: 'text' },
  // conversion_action_name IS compatible with ad_group_ad + these metrics
  { field: 'segments.conversion_action_name',     label: 'Acción de conv.',  category: 'segment',   format: 'text',     default: true },
  { field: 'segments.keyword.info.text',          label: 'Keyword',          category: 'segment',   format: 'text',     default: true },
  { field: 'segments.keyword.info.match_type',    label: 'Tipo de match',    category: 'segment',   format: 'text' },
]

const KEYWORD_VIEW_COLUMNS: ColumnDef[] = [
  { field: 'campaign.id',                              label: 'ID campaña',       category: 'dimension', format: 'text' },
  { field: 'campaign.name',                            label: 'Campaña',          category: 'dimension', format: 'text',     default: true },
  { field: 'campaign.status',                         label: 'Estado campaña',   category: 'dimension', format: 'status' },
  { field: 'campaign.advertising_channel_type',       label: 'Tipo',             category: 'dimension', format: 'text' },
  { field: 'ad_group.id',                             label: 'ID grupo',         category: 'dimension', format: 'text' },
  { field: 'ad_group.name',                           label: 'Grupo de anuncio', category: 'dimension', format: 'text',     default: true },
  { field: 'ad_group_criterion.keyword.text',         label: 'Keyword',          category: 'dimension', format: 'text',     default: true },
  { field: 'ad_group_criterion.keyword.match_type',   label: 'Tipo de match',    category: 'dimension', format: 'text',     default: true },
  { field: 'metrics.impressions',                     label: 'Impresiones',      category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.clicks',                          label: 'Clicks',           category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.cost_micros',                     label: 'Inversión',        category: 'metric',    format: 'currency', default: true },
  { field: 'metrics.ctr',                             label: 'CTR',              category: 'metric',    format: 'percent' },
  { field: 'metrics.average_cpc',                     label: 'CPC promedio',     category: 'metric',    format: 'currency' },
  { field: 'metrics.conversions',                     label: 'Conversiones',     category: 'metric',    format: 'number',   default: true },
  { field: 'metrics.conversions_value',               label: 'Valor conv.',      category: 'metric',    format: 'currency' },
  { field: 'metrics.all_conversions',                 label: 'Todas las conv.',  category: 'metric',    format: 'number' },
  { field: 'segments.date',                           label: 'Fecha',            category: 'segment',   format: 'text' },
]

export const RESOURCE_COLUMNS: Record<ResourceName, ColumnDef[]> = {
  campaign:     CAMPAIGN_COLUMNS,
  ad_group_ad:  AD_GROUP_AD_COLUMNS,
  keyword_view: KEYWORD_VIEW_COLUMNS,
}

export const RESOURCE_LABELS: Record<ResourceName, string> = {
  campaign:     'Campañas',
  ad_group_ad:  'Anuncios',
  keyword_view: 'Keywords',
}

/** Returns the set of valid field paths for a given resource */
export function getAllowedFields(resource: ResourceName): Set<string> {
  return new Set(RESOURCE_COLUMNS[resource].map(c => c.field))
}

/** Returns default columns for a given resource */
export function getDefaultColumns(resource: ResourceName): string[] {
  return RESOURCE_COLUMNS[resource].filter(c => c.default).map(c => c.field)
}

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  SEARCH:          'Busqueda',
  DISPLAY:         'Display',
  SHOPPING:        'Shopping',
  VIDEO:           'Video (YouTube)',
  SMART:           'Smart',
  PERFORMANCE_MAX: 'Performance Max',
  DISCOVERY:       'Discovery',
  APP_CAMPAIGN:    'Aplicaciones',
  LOCAL:           'Local',
  UNSPECIFIED:     'Sin especificar',
  UNKNOWN:         'Otro',
}
