'use client'

import { useMemo } from 'react'
import type { Client } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts'

interface RoasChartProps {
  clients: Client[]
}

// Simulated ROAS data for clients
const clientRoasData: Record<string, number> = {
  'Mundos E': 3.4,
  'ADT': 4.8,
  'VN Global': 5.1,
  'Nobis': 4.0,
  'Pire Rayen': 3.8,
  'Biblos': 2.9,
  'Corralón Tronador': 4.2,
  'Del Sur Autos': 3.1,
}

export function RoasChart({ clients }: RoasChartProps) {
  const chartData = useMemo(() => {
    const topClients = clients
      .filter(c => c.fee_mdk && c.fee_mdk > 1000000)
      .slice(0, 4)
      .map(c => ({
        name: c.business_name.length > 10 
          ? c.business_name.substring(0, 10) + '...'
          : c.business_name,
        fullName: c.business_name,
        roas: clientRoasData[c.business_name] || (3 + Math.random() * 2),
        status: c.status,
      }))
    
    return topClients
  }, [clients])

  const leader = chartData.length > 0 
    ? chartData.reduce((a, b) => a.roas > b.roas ? a : b)
    : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">ROAS por cliente</CardTitle>
        <Button variant="ghost" size="sm" className="text-primary gap-1">
          <Sparkles className="h-3 w-3" />
          IA
        </Button>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="horizontal">
              <XAxis 
                dataKey="name" 
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <YAxis 
                hide 
                domain={[0, 'dataMax + 1']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                        <p className="font-medium">{data.fullName}</p>
                        <p className="text-sm text-muted-foreground">
                          ROAS: <span className="text-foreground font-medium">{data.roas.toFixed(1)}x</span>
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Bar 
                dataKey="roas" 
                radius={[4, 4, 0, 0]}
                maxBarSize={60}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`}
                    fill={entry.roas === leader?.roas 
                      ? 'var(--primary)' 
                      : 'var(--muted-foreground)'
                    }
                    fillOpacity={entry.roas === leader?.roas ? 1 : 0.3}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {leader && (
          <p className="text-sm text-muted-foreground mt-3">
            <span className="font-medium text-foreground">{leader.fullName}</span> lidera con {leader.roas.toFixed(1)}x
          </p>
        )}
      </CardContent>
    </Card>
  )
}
