'use client'

import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatMoney, type MonthlyPoint } from '@/lib/aurelia/metrics'

const movementConfig = {
  altas: { label: 'Altas', color: 'var(--chart-2)' },
  bajas: { label: 'Bajas', color: 'var(--destructive)' },
  activos: { label: 'Activos', color: 'var(--primary)' },
} satisfies ChartConfig

const mrrConfig = { mrr: { label: 'MRR', color: 'var(--primary)' } } satisfies ChartConfig

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 }

export function AureliaGrowthChart({ series, currency, className }: { series: MonthlyPoint[]; currency: string; className?: string }) {
  const [view, setView] = useState<'movimientos' | 'mrr'>('movimientos')
  const compactMoney = (value: number) => new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-medium">Evolución mensual</CardTitle>
          <CardDescription>{view === 'mrr' ? 'MRR estimado con el plan vigente de cada cliente' : 'Altas y bajas por mes, con clientes activos al cierre'}</CardDescription>
        </div>
        <ToggleGroup type="single" size="sm" variant="outline" value={view} onValueChange={(value) => value && setView(value as typeof view)} aria-label="Vista del gráfico">
          <ToggleGroupItem value="movimientos" className="px-3 text-xs">Clientes</ToggleGroupItem>
          <ToggleGroupItem value="mrr" className="px-3 text-xs">MRR</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {view === 'movimientos' ? (
          <ChartContainer config={movementConfig} className="h-72 w-full">
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis yAxisId="moves" tickLine={false} axisLine={false} tick={axisTick} width={32} allowDecimals={false} />
              <YAxis yAxisId="active" orientation="right" tickLine={false} axisLine={false} tick={axisTick} width={40} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar yAxisId="moves" dataKey="altas" fill="var(--color-altas)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar yAxisId="moves" dataKey="bajas" fill="var(--color-bajas)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Line yAxisId="active" dataKey="activos" stroke="var(--color-activos)" strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ChartContainer>
        ) : (
          <ChartContainer config={mrrConfig} className="h-72 w-full">
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis tickLine={false} axisLine={false} tick={axisTick} width={48} tickFormatter={compactMoney} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value), currency)} />} />
              <Bar dataKey="mrr" fill="var(--color-mrr)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
