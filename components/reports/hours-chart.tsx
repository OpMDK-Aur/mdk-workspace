'use client'

import { useMemo } from 'react'
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { mockDailyHours } from '@/lib/time-tracking/mock-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const chartConfig = {
  hours: {
    label: 'Hours',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

export function HoursChart() {
  const chartData = useMemo(() => {
    return mockDailyHours.map((item) => ({
      date: new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' }),
      hours: item.hours,
    }))
  }, [])

  const totalHours = mockDailyHours.reduce((acc, item) => acc + item.hours, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Hours per Day</CardTitle>
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{totalHours.toFixed(1)}h</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              width={30}
              tickFormatter={(value) => `${value}h`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [`${value}h`, 'Hours worked']}
                />
              }
            />
            <Bar
              dataKey="hours"
              fill="var(--primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
