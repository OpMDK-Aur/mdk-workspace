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
  type TooltipProps,
} from 'recharts'

interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'area'
  title?: string
  data: Array<Record<string, string | number>>
  xKey?: string
  yKey?: string
  color?: string
  colors?: string[]
  /** Optional: "currency", "percent", or "number" — controls value formatting */
  format?: 'currency' | 'percent' | 'number'
  /** Optional currency symbol, defaults to "$" */
  currencySymbol?: string
}

// Palette mapped to the app design tokens (OKLCH chart tokens)
const PALETTE = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
]

const AXIS_COLOR = 'var(--color-muted-foreground)'
const GRID_COLOR = 'var(--color-border)'

function formatValue(
  value: number,
  format?: 'currency' | 'percent' | 'number',
  currencySymbol = '$'
): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value)
  if (format === 'currency') {
    return `${currencySymbol}${value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }
  if (format === 'percent') {
    return `${value.toLocaleString('es-MX', { maximumFractionDigits: 2 })}%`
  }
  return value.toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

function CustomTooltip({
  active,
  payload,
  label,
  format,
  currencySymbol,
}: TooltipProps<number, string> & {
  format?: 'currency' | 'percent' | 'number'
  currencySymbol?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      {label !== undefined && (
        <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-popover-foreground">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold tabular-nums">
            {formatValue(Number(entry.value), format, currencySymbol)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ChartBlock({ config }: { config: ChartData }) {
  const {
    type,
    title,
    data,
    xKey = 'name',
    yKey = 'value',
    color,
    colors,
    format,
    currencySymbol = '$',
  } = config

  if (!data || data.length === 0) {
    return (
      <div className="my-4 rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        No hay datos para mostrar
      </div>
    )
  }

  const mainColor = color || PALETTE[0]
  const gradientId = `area-gradient-${yKey}-${type}`

  const tooltip = (
    <Tooltip
      cursor={{ fill: 'var(--color-muted)', opacity: 0.25 }}
      content={<CustomTooltip format={format} currencySymbol={currencySymbol} />}
    />
  )

  const axisProps = {
    tick: { fill: AXIS_COLOR, fontSize: 12 },
    tickLine: { stroke: GRID_COLOR },
    axisLine: { stroke: GRID_COLOR },
  }

  const yTickFormatter = (v: number) => {
    if (format === 'currency') {
      return v >= 1000 ? `${currencySymbol}${(v / 1000).toFixed(1)}k` : `${currencySymbol}${v}`
    }
    if (format === 'percent') return `${v}%`
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
  }

  return (
    <div className="my-4 rounded-xl border bg-card p-5 shadow-sm">
      {title && (
        <h4 className="mb-4 text-center text-sm font-semibold text-card-foreground text-balance">
          {title}
        </h4>
      )}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey={xKey} {...axisProps} />
              <YAxis {...axisProps} tickFormatter={yTickFormatter} width={48} />
              {tooltip}
              <Bar dataKey={yKey} radius={[6, 6, 0, 0]} maxBarSize={64}>
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors?.[index] || color || PALETTE[index % PALETTE.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey={xKey} {...axisProps} />
              <YAxis {...axisProps} tickFormatter={yTickFormatter} width={48} />
              {tooltip}
              <Line
                type="monotone"
                dataKey={yKey}
                stroke={mainColor}
                strokeWidth={2.5}
                dot={{ fill: mainColor, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={mainColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={mainColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey={xKey} {...axisProps} />
              <YAxis {...axisProps} tickFormatter={yTickFormatter} width={48} />
              {tooltip}
              <Area
                type="monotone"
                dataKey={yKey}
                stroke={mainColor}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
              />
            </AreaChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                dataKey={yKey}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={100}
                paddingAngle={2}
                label={({ name, percent }) =>
                  `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={colors?.[index] || PALETTE[index % PALETTE.length]}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              {tooltip}
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
