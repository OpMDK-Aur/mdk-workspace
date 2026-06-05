'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'area'
  title?: string
  data: Array<Record<string, string | number>>
  xKey?: string
  yKey?: string
  color?: string
  colors?: string[]
}

const COLORS = ['#7F77DD', '#82ca9d', '#ffc658', '#ff7300', '#8884d8', '#00C49F']

export function ChartBlock({ config }: { config: ChartData }) {
  const { type, title, data, xKey = 'name', yKey = 'value', color = '#7F77DD', colors } = config

  if (!data || data.length === 0) {
    return <div className="p-4 text-muted-foreground text-sm">No hay datos para mostrar</div>
  }

  return (
    <div className="my-4 p-4 rounded-lg border bg-card">
      {title && <h4 className="font-medium mb-4 text-center">{title}</h4>}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={xKey} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={xKey} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={{ fill: color }} />
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey={xKey} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Area type="monotone" dataKey={yKey} stroke={color} fill={color} fillOpacity={0.3} />
            </AreaChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                dataKey={yKey}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors?.[index] || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
