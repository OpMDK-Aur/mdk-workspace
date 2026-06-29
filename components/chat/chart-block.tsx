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
  LabelList,
  type TooltipProps,
} from 'recharts'

type ValueFormat = 'currency' | 'percent' | 'number'

interface SeriesConfig {
  /** Key in each data row that holds this series' value */
  key: string
  /** Display name for legend/tooltip */
  name?: string
  /** Value formatting for this series */
  format?: ValueFormat
  /** Optional fixed color */
  color?: string
}

interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'area'
  title?: string
  data: Array<Record<string, string | number>>
  xKey?: string
  yKey?: string
  color?: string
  colors?: string[]
  /** Optional: "currency", "percent", or "number" — controls value formatting */
  format?: ValueFormat
  /** Optional currency symbol, defaults to "$" */
  currencySymbol?: string
  /** Bar charts only: "horizontal" renders bars left-to-right. Defaults to vertical. */
  layout?: 'horizontal' | 'vertical'
  /** Multiple metrics per category (e.g. inversión + leads). When set, overrides yKey. */
  series?: SeriesConfig[]
  /** Show value labels on bars. */
  showValues?: boolean
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
const LABEL_COLOR = 'var(--color-foreground)'

function formatValue(
  value: number,
  format?: ValueFormat,
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

// Compact format for on-bar labels to avoid clutter on large numbers
function compactValue(
  value: number,
  format?: ValueFormat,
  currencySymbol = '$'
): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value)
  const prefix = format === 'currency' ? currencySymbol : ''
  const suffix = format === 'percent' ? '%' : ''
  let n: string
  if (Math.abs(value) >= 1_000_000) n = `${(value / 1_000_000).toFixed(1)}M`
  else if (Math.abs(value) >= 1_000) n = `${(value / 1_000).toFixed(1)}k`
  else n = value.toLocaleString('es-MX', { maximumFractionDigits: 2 })
  return `${prefix}${n}${suffix}`
}

function CustomTooltip({
  active,
  payload,
  label,
  format,
  currencySymbol,
  seriesFormats,
}: TooltipProps<number, string> & {
  format?: ValueFormat
  currencySymbol?: string
  seriesFormats?: Record<string, ValueFormat | undefined>
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      {label !== undefined && (
        <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      )}
      {payload.map((entry, i) => {
        const fmt = seriesFormats?.[String(entry.dataKey)] ?? format
        return (
          <div key={i} className="flex items-center gap-2 text-popover-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold tabular-nums">
              {formatValue(Number(entry.value), fmt, currencySymbol)}
            </span>
          </div>
        )
      })}
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
    layout = 'vertical',
    series,
    showValues,
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
  const isHorizontal = type === 'bar' && layout === 'horizontal'

  // Normalize the list of series. Single-series charts fall back to yKey.
  const seriesList: SeriesConfig[] =
    series && series.length > 0
      ? series
      : [{ key: yKey, name: yKey, format }]
  const isMultiSeries = seriesList.length > 1

  const seriesFormats: Record<string, ValueFormat | undefined> = {}
  for (const s of seriesList) seriesFormats[s.key] = s.format ?? format

  const tooltip = (
    <Tooltip
      cursor={{ fill: 'var(--color-muted)', opacity: 0.25 }}
      content={
        <CustomTooltip
          format={format}
          currencySymbol={currencySymbol}
          seriesFormats={seriesFormats}
        />
      }
    />
  )

  const axisProps = {
    tick: { fill: AXIS_COLOR, fontSize: 12 },
    tickLine: { stroke: GRID_COLOR },
    axisLine: { stroke: GRID_COLOR },
  }

  const valueTickFormatter = (v: number) => {
    if (format === 'currency') {
      return v >= 1000 ? `${currencySymbol}${(v / 1000).toFixed(1)}k` : `${currencySymbol}${v}`
    }
    if (format === 'percent') return `${v}%`
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
  }

  // Bars grow with more categories/series so labels stay readable
  const chartHeight = isHorizontal
    ? Math.max(260, data.length * (isMultiSeries ? 56 : 44) + 60)
    : 320

  const renderBars = () =>
    seriesList.map((s, si) => (
      <Bar
        key={s.key}
        dataKey={s.key}
        name={s.name || s.key}
        radius={isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
        maxBarSize={64}
        fill={s.color || (isMultiSeries ? PALETTE[si % PALETTE.length] : undefined)}
      >
        {/* Per-category colors only when single series (so each account is distinct) */}
        {!isMultiSeries &&
          data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={colors?.[index] || color || PALETTE[index % PALETTE.length]}
            />
          ))}
        {showValues && (
          <LabelList
            dataKey={s.key}
            position={isHorizontal ? 'right' : 'top'}
            fill={LABEL_COLOR}
            fontSize={11}
            formatter={(v: number) =>
              compactValue(v, s.format ?? format, currencySymbol)
            }
          />
        )}
      </Bar>
    ))

  return (
    <div className="my-4 rounded-xl border bg-card p-5 shadow-sm">
      {title && (
        <h4 className="mb-4 text-center text-sm font-semibold text-card-foreground text-balance">
          {title}
        </h4>
      )}
      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            isHorizontal ? (
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 48, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={valueTickFormatter} />
                <YAxis
                  type="category"
                  dataKey={xKey}
                  {...axisProps}
                  width={Math.min(160, Math.max(80, ...data.map((d) => String(d[xKey] ?? '').length * 7)))}
                />
                {tooltip}
                {isMultiSeries && (
                  <Legend wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }} />
                )}
                {renderBars()}
              </BarChart>
            ) : (
              <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                <XAxis dataKey={xKey} {...axisProps} />
                <YAxis {...axisProps} tickFormatter={valueTickFormatter} width={48} />
                {tooltip}
                {isMultiSeries && (
                  <Legend wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }} />
                )}
                {renderBars()}
              </BarChart>
            )
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey={xKey} {...axisProps} />
              <YAxis {...axisProps} tickFormatter={valueTickFormatter} width={48} />
              {tooltip}
              {isMultiSeries && <Legend wrapperStyle={{ fontSize: 12, color: AXIS_COLOR }} />}
              {seriesList.map((s, si) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name || s.key}
                  stroke={s.color || (isMultiSeries ? PALETTE[si % PALETTE.length] : mainColor)}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
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
              <YAxis {...axisProps} tickFormatter={valueTickFormatter} width={48} />
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
