'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { mockClientSummaries } from '@/lib/time-tracking/mock-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ClientDonutChart() {
  const chartData = useMemo(() => {
    return mockClientSummaries.map((client) => ({
      name: client.client_name,
      value: client.hours,
      color: client.client_color,
    }))
  }, [])

  const totalHours = mockClientSummaries.reduce((acc, c) => acc + c.hours, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Hours by Client</CardTitle>
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{totalHours.toFixed(1)}h</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="bg-card border border-border rounded-lg p-2 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: data.color }}
                          />
                          <span className="text-sm font-medium">{data.name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {data.value.toFixed(1)}h
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
        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-4 mt-4">
          {chartData.map((client, index) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: client.color }}
              />
              <span className="text-sm text-muted-foreground">{client.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
