'use client'

import type { InvestmentTrendPoint } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

interface InvestmentTrendChartProps {
  data: InvestmentTrendPoint[]
  loading?: boolean
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function formatDateLabel(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM', { locale: es })
  } catch {
    return dateStr
  }
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse h-[200px] bg-muted rounded-lg" />
  )
}

export function InvestmentTrendChart({ data, loading }: InvestmentTrendChartProps) {
  const hasData = data.length > 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Tendencia de inversion</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Gasto diario en el periodo seleccionado</p>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton />
        ) : !hasData ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Sin datos para el periodo seleccionado</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tick={{ fill: 'var(--muted-foreground)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tick={{ fill: 'var(--muted-foreground)' }}
                  width={60}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                          <p className="text-xs text-muted-foreground mb-1">{formatDateLabel(label)}</p>
                          <p className="text-sm font-medium">
                            Gasto: {formatCurrency(payload[0]?.value as number || 0)}
                          </p>
                          {payload[1] && (
                            <p className="text-xs text-muted-foreground">
                              Leads: {payload[1].value}
                            </p>
                          )}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--primary)' }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="var(--status-verde)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--status-verde)' }}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-primary" />
            <span className="text-xs text-muted-foreground">Gasto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-status-verde border-dashed" style={{ borderTop: '2px dashed var(--status-verde)', height: 0 }} />
            <span className="text-xs text-muted-foreground">Leads</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
