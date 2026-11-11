'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Search, ArrowUpDown, ExternalLink } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardBlock } from '@/lib/conexa/dashboard-presets'

type RecordRow = Record<string, unknown>
type PlatformInfo = { name: string; key: string; color: string; iconUrl: string | null; connected: boolean; detail: string }
type Props = { block: DashboardBlock; platforms: PlatformInfo[]; metrics: Record<string, Array<{ label: string; value: number }>>; previousMetrics: Record<string, Array<{ label: string; value: number }>>; platformData: Record<string, unknown>; loading: boolean; onConnections: () => void }

const asRecord = (value: unknown): RecordRow => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordRow : {}
const asRows = (value: unknown): RecordRow[] => Array.isArray(value) ? value.filter((item): item is RecordRow => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []
const labels: Record<string, string> = { name: 'Nombre', campaign_name: 'Campaña', status: 'Estado', spend: 'Inversión', impressions: 'Impresiones', clicks: 'Clics', results: 'Resultados', conversions: 'Conversiones', ctr: 'CTR', cpc: 'CPC', cpl: 'CPL', date: 'Fecha', sessions: 'Sesiones', activeUsers: 'Usuarios', eventCount: 'Eventos', keyEvents: 'Conversiones', contacts: 'Contactos', opportunities: 'Oportunidades', sales: 'Ventas' }

function recordsFor(block: DashboardBlock, platformData: Record<string, unknown>): RecordRow[] {
  const root = asRecord(platformData[block.platform])
  if (block.platform === 'crm') {
    const crm = asRecord(platformData.crm)
    const acquisition = asRecord(crm.acquisition)
    return asRows(acquisition.campaignRows ?? crm.opportunities ?? crm.contacts ?? crm.sales)
  }
  if (block.platform === 'analytics') {
    const reports = asRecord(root.reports)
    return asRows(reports.byPage ?? reports.pages ?? reports.overview ?? reports.byDay)
  }
  const entity = block.dimension || 'campaigns'
  const entityName = entity.replace(/s$/, '')
  return asRows(root.accounts).flatMap((account) => asRows(asRecord(account)[entity] ?? asRecord(account)[entityName]))
}

export function getDashboardBlockRows(block: DashboardBlock, platformData: Record<string, unknown>) {
  return recordsFor(block, platformData)
}

function dailyRows(block: DashboardBlock, platformData: Record<string, unknown>) {
  const root = asRecord(platformData[block.platform])
  let rows: RecordRow[] = []
  if (block.platform === 'analytics') {
    rows = asRows(asRecord(root.reports).byDay)
  } else if (block.platform === 'meta' || block.platform === 'google') {
    rows = asRows(root.accounts).flatMap((account) => asRows(asRecord(account).daily))
  }
  const metricKey = block.metric?.toLowerCase() ?? ''
  const aliases: Record<string, string[]> = {
    'inversión': ['spend', 'cost', 'investment'], 'impresiones': ['impressions'], 'clicks': ['clicks'], 'clics': ['clicks'],
    'resultados': ['results', 'conversions', 'leads'], 'conversiones': ['conversions', 'results', 'keyEvents'],
    'sesiones': ['sessions'], 'usuarios': ['activeUsers', 'users'], 'eventos': ['eventCount'],
  }
  const keys = aliases[metricKey] ?? [block.metric ?? '']
  return rows.map((row) => ({ date: String(row.date ?? row.date_start ?? ''), value: keys.reduce((sum, key) => sum || Number(row[key]) || 0, 0) })).filter((row) => row.date)
}

function formatValue(value: number, metric: string | null) {
  const money = /inversión|costo|cpl|cpc/i.test(metric ?? '')
  return new Intl.NumberFormat('es-AR', { style: money ? 'currency' : 'decimal', currency: 'ARS', maximumFractionDigits: money ? 0 : 1 }).format(value)
}

export function DashboardBlockRenderer({ block, platforms, metrics, previousMetrics, platformData, loading, onConnections }: Props) {
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState('')
  const [ascending, setAscending] = useState(true)
  const platform = platforms.find((item) => item.key === block.platform)
  const platformMetrics = metrics[block.platform] ?? []
  const metric = platformMetrics.find((item) => item.label === block.metric)
  const previousMetric = (previousMetrics[block.platform] ?? []).find((item) => item.label === block.metric)
  const change = metric && previousMetric && previousMetric.value !== 0 ? ((metric.value - previousMetric.value) / Math.abs(previousMetric.value)) * 100 : null
  const timeseries = useMemo(() => dailyRows(block, platformData), [block, platformData])
  const tableRows = useMemo(() => recordsFor(block, platformData), [block, platformData])
  const columns = block.columns.length ? block.columns : ['name', 'status', block.metric === 'Inversión' ? 'spend' : 'results']
  const visibleRows = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('es')
    const filtered = tableRows.filter((row) => !query || columns.some((column) => String(row[column] ?? '').toLocaleLowerCase('es').includes(query)))
    return sortKey ? [...filtered].sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'es', { numeric: true }) * (ascending ? 1 : -1)) : filtered
  }, [ascending, columns, filter, sortKey, tableRows])

  return (
    <article className={block.type === 'table' ? 'flex h-[360px] min-h-0 flex-col overflow-hidden rounded-xl border border-[#e7e7e5] bg-white' : 'flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e7e7e5] bg-white'}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#eeeeec] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#202020]">{block.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#777]">
            {platform?.iconUrl ? <img src={platform.iconUrl} alt="" className="size-3.5 object-contain" /> : <span className="size-2 rounded-full" style={{ backgroundColor: platform?.color ?? '#888' }} />}
            {platform?.name ?? block.platform}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-[#f7f7f6] px-2 py-1 text-[10px] font-medium text-[#777]">{block.type === 'kpi' ? 'KPI' : block.type === 'table' ? 'Listado' : block.type === 'funnel' ? 'Funnel' : block.type === 'line' ? 'Líneas' : 'Barras'}</span>
      </header>
      <div className="min-h-0 flex-1 p-4">
        {!platform?.connected ? <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center"><p className="text-sm font-medium text-[#555]">Sin conexión</p><button type="button" onClick={onConnections} className="inline-flex items-center gap-1 text-xs font-medium text-[#F97316] hover:underline">Ir a Conexiones <ExternalLink aria-hidden="true" className="size-3" /></button></div> : loading ? <div role="status" aria-label="Cargando bloque" className="flex flex-col gap-3"><Skeleton className="h-7 w-1/2" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-32 w-full" /></div> : !platformMetrics.length && !tableRows.length ? <div className="flex h-full min-h-24 items-center justify-center text-sm text-[#888]">Sin datos</div> : block.type === 'kpi' ? <div className="flex h-full flex-col justify-center"><p className="text-3xl font-semibold tracking-tight tabular-nums text-[#202020]">{metric ? formatValue(Number(metric.value), block.metric) : 'Sin datos'}</p><p className="mt-2 text-xs text-[#777]">{block.metric ?? 'Métrica'} · {block.dimension ?? 'período seleccionado'}</p><p className="mt-3 text-[11px] text-[#777]">{change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs. período anterior` : previousMetric?.value === 0 && metric ? metric.value > 0 ? 'Nuevo en el período' : '0% vs. período anterior' : 'Variación no disponible'}</p></div> : block.type === 'table' ? <div className="flex h-full min-h-0 flex-col"><label className="relative mb-2 shrink-0"><Search aria-hidden="true" className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#888]" /><input value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={`Buscar en ${block.title}`} placeholder="Buscar filas..." className="h-8 w-full rounded-md border border-[#e7e7e5] pl-8 pr-3 text-xs outline-none focus:border-[#F97316]" /></label><div className="min-h-0 flex-1 overflow-auto rounded-md border border-[#eeeeec]"><table className="w-full min-w-[420px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-[#f8f8f7] text-[#666]"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap border-b border-[#e7e7e5] px-3 py-2 font-semibold"><button type="button" className="inline-flex items-center gap-1" onClick={() => { setAscending(sortKey === column ? !ascending : true); setSortKey(column) }}>{labels[column] ?? column}<ArrowUpDown aria-hidden="true" className="size-3" /></button></th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={String(row.id ?? index)} className="border-b border-[#f0f0ef] last:border-0">{columns.map((column) => <td key={column} className="max-w-48 truncate px-3 py-2 text-[#444]">{String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table>{visibleRows.length === 0 && <p className="px-3 py-8 text-center text-xs text-[#888]">Sin datos</p>}</div></div> : block.type === 'funnel' ? <FunnelView metrics={platformMetrics} block={block} /> : timeseries.length ? <div className="h-full min-h-40"><ResponsiveContainer width="100%" height="100%">{block.type === 'line' ? <LineChart data={timeseries} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#eeeeec" strokeDasharray="3 3" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={(value) => String(value).slice(5)} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => formatValue(Number(value ?? 0), block.metric)} /><Line type="monotone" dataKey="value" stroke="#F97316" strokeWidth={2} dot={false} /></LineChart> : <BarChart data={timeseries} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#eeeeec" strokeDasharray="3 3" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={(value) => String(value).slice(5)} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => formatValue(Number(value ?? 0), block.metric)} /><Bar dataKey="value" fill="#F97316" radius={[3, 3, 0, 0]} /></BarChart>}</ResponsiveContainer></div> : <div className="flex h-full min-h-24 items-center justify-center text-sm text-[#888]">Sin datos temporales para esta métrica</div>}
      </div>
    </article>
  )
}

function FunnelView({ metrics, block }: { metrics: Array<{ label: string; value: number }>; block: DashboardBlock }) {
  const candidates = metrics.filter((item) => /contact|lead|oportun|venta|sesion|conversion/i.test(item.label))
  const stages = candidates.length ? candidates : block.metric ? metrics.filter((item) => item.label === block.metric) : []
  const max = Math.max(1, ...stages.map((stage) => stage.value))
  return stages.length ? <div className="flex h-full flex-col justify-center gap-3">{stages.slice(0, 5).map((stage) => <div key={stage.label}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate text-[#555]">{stage.label}</span><span className="font-medium tabular-nums">{stage.value.toLocaleString('es-AR')}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#f2f2f1]"><div className="h-full rounded-full bg-[#F97316]" style={{ width: `${Math.max(4, stage.value / max * 100)}%` }} /></div></div>)}</div> : <div className="flex h-full items-center justify-center text-sm text-[#888]">Sin datos</div>
}
