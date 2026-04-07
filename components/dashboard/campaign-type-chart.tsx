'use client'

import type { CampaignTypeData, Platform } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface CampaignTypeChartProps {
  data: CampaignTypeData[]
  platform: Platform
  loading?: boolean
}

// Campaign type labels by platform
const META_CAMPAIGN_TYPES: Record<string, string> = {
  LEAD_GENERATION: 'Generacion de leads',
  CONVERSIONS: 'Conversiones',
  MESSAGES: 'Mensajes',
  TRAFFIC: 'Trafico',
  AWARENESS: 'Reconocimiento',
  APP_INSTALLS: 'Instalacion de apps',
  VIDEO_VIEWS: 'Vistas de video',
  PRODUCT_CATALOG_SALES: 'Ventas de catalogo',
  BRAND_AWARENESS: 'Reconocimiento de marca',
  REACH: 'Alcance',
}

const GOOGLE_CAMPAIGN_TYPES: Record<string, string> = {
  SEARCH: 'Busqueda',
  DISPLAY: 'Display',
  SHOPPING: 'Shopping',
  VIDEO: 'Video',
  SMART: 'Smart',
  PERFORMANCE_MAX: 'Performance Max',
  DISCOVERY: 'Discovery',
  APP: 'Aplicaciones',
  APP_CAMPAIGN: 'Aplicaciones',
  LOCAL: 'Local',
  MULTI_CHANNEL: 'Multicanal',
  UNSPECIFIED: 'Sin especificar',
  UNKNOWN: 'Otro',
}

const CHART_COLORS = [
  'var(--primary)',
  'var(--status-verde)',
  'var(--status-amarillo)',
  'var(--status-naranja)',
  'var(--status-rojo)',
  'var(--muted-foreground)',
]

function getTypeLabel(type: string, platform: Platform, existingLabel?: string): string {
  // Use label already resolved by the API when available
  if (existingLabel && existingLabel !== type) return existingLabel
  if (platform === 'meta') return META_CAMPAIGN_TYPES[type] || type
  if (platform === 'google') return GOOGLE_CAMPAIGN_TYPES[type] || type
  return META_CAMPAIGN_TYPES[type] || GOOGLE_CAMPAIGN_TYPES[type] || type
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-6">
        <div className="h-[180px] w-[180px] rounded-full bg-muted" />
        <div className="space-y-3 flex-1">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-muted" />
              <div className="h-3 flex-1 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CampaignTypeChart({ data, platform, loading }: CampaignTypeChartProps) {
  const chartData = data.map((d, i) => ({
    ...d,
    label: getTypeLabel(d.type, platform, (d as { label?: string }).label),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const hasSomeData = chartData.length > 0 && chartData.some(d => d.spend > 0)

  const subtitle = platform === 'meta'
    ? 'Segun objetivo de campana en Meta Ads'
    : platform === 'google'
    ? 'Segun tipo de canal en Google Ads'
    : 'Distribucion combinada Meta + Google'

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Distribucion por tipo de campana</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton />
        ) : !hasSomeData ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Sin datos para el periodo seleccionado</p>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <div className="h-[180px] w-[180px] flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="spend"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload
                        return (
                          <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                            <p className="font-medium text-sm">{d.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {d.percentage.toFixed(1)}% de inversion
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {d.leads} leads
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5 flex-1 min-w-0">
              {chartData.map((item) => (
                <div key={item.type} className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-sm truncate flex-1">{item.label}</span>
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">
                    {item.percentage.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
