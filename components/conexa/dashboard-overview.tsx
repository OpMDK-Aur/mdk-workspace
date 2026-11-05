'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type ChangeEvent } from 'react'
import useSWR from 'swr'
import { FileSpreadsheet, LoaderCircle, RefreshCw, UploadCloud } from 'lucide-react'
import { MetaDashboardSection, GenericPlatformSection } from '@/components/conexa/dashboard-platform-sections'
import { DashboardDataTable } from '@/components/conexa/dashboard-data-table'
import type { DashboardBudget, DashboardMetric, DashboardPlatform, DashboardRecord, DashboardRegionRow } from '@/components/conexa/dashboard-types'

type DashboardPlatformData = Record<string, unknown>
type DashboardOverviewProps = {
  clientId: string | null
  clientName: string | null
  period: string
  customRange: { from: string; to: string }
  periodSelector: ReactNode
  platforms: DashboardPlatform[]
  platformMetrics: Record<string, DashboardMetric[]>
  platformData: DashboardPlatformData
  loading: boolean
  updatedAt: number | null
  onRefresh: () => void
}
type Range = { from: string; to: string }
type RangePair = { current: Range; compared: Range; label: string }
type PlatformMetricResponse = { platformMetrics?: Record<string, DashboardMetric[]> }
type Comparison = { ranges: RangePair; current: PlatformMetricResponse; compared: PlatformMetricResponse }

const asRecord = (value: unknown): DashboardRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as DashboardRecord : {}
const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const fetchBudget = async (url: string): Promise<DashboardBudget> => {
  const response = await fetch(url)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar el archivo de presupuesto.')
  return payload as DashboardBudget
}

function todayArgentina() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function monthStart(value: string, monthOffset = 0) {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + monthOffset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function monthEnd(value: string, monthOffset = 0) {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month + monthOffset, 0))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getComparisonRanges(preset: string, custom: { currentFrom: string; currentTo: string; comparedFrom: string; comparedTo: string }, baseRange?: Range): RangePair | null {
  const today = todayArgentina()
  if (preset === 'custom') {
    if (!custom.currentFrom || !custom.currentTo || !custom.comparedFrom || !custom.comparedTo) return null
    return { current: { from: custom.currentFrom, to: custom.currentTo }, compared: { from: custom.comparedFrom, to: custom.comparedTo }, label: 'Rango personalizado' }
  }
  if (preset === 'month-to-date') {
    const current = { from: monthStart(today), to: today }
    const previousStart = monthStart(today, -1)
    const maxDay = Number(today.slice(8, 10))
    const previousEndCandidate = addDays(previousStart, maxDay - 1)
    const previousEnd = previousEndCandidate > monthEnd(today, -1) ? monthEnd(today, -1) : previousEndCandidate
    return { current, compared: { from: previousStart, to: previousEnd }, label: 'Este mes vs mismo tramo del mes anterior' }
  }
  if (preset === 'last-month') {
    return { current: { from: monthStart(today, -1), to: monthEnd(today, -1) }, compared: { from: monthStart(today, -2), to: monthEnd(today, -2) }, label: 'Mes pasado vs anterior' }
  }
  if (preset === '7-days') {
    return { current: { from: addDays(today, -6), to: today }, compared: { from: addDays(today, -13), to: addDays(today, -7) }, label: 'Últimos 7 días vs 7 anteriores' }
  }
  if (preset === '30-days') {
    return { current: { from: addDays(today, -29), to: today }, compared: { from: addDays(today, -59), to: addDays(today, -30) }, label: 'Últimos 30 días vs 30 anteriores' }
  }
  const [year, month, day] = today.split('-').map(Number)
  const previousYear = `${year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { current: { from: today, to: today }, compared: { from: previousYear, to: previousYear }, label: 'Hoy vs mismo día del año anterior' }
}

async function fetchMetricsForRange(clientId: string, range: Range): Promise<PlatformMetricResponse> {
  const response = await fetch('/api/conexa/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, period: 'Personalizado', customRange: { from: range.from, to: range.to }, selectedAccounts: {}, crmFilters: {} }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'No se pudo comparar este período.')
  return payload as PlatformMetricResponse
}

function compareMetricRows(platforms: DashboardPlatform[], current: PlatformMetricResponse, compared: PlatformMetricResponse) {
  const currentMetrics = current.platformMetrics ?? {}
  const comparedMetrics = compared.platformMetrics ?? {}
  return platforms.flatMap((platform) => {
    if (platform.key === 'tag_manager') return []
    const previousByLabel = new Map((comparedMetrics[platform.key] ?? []).map((metric) => [normalize(metric.label), Number(metric.value ?? 0)]))
    return (currentMetrics[platform.key] ?? []).map((metric) => {
      const currentValue = Number(metric.value ?? 0)
      const comparedValue = previousByLabel.get(normalize(metric.label)) ?? 0
      const variation = comparedValue ? ((currentValue - comparedValue) / comparedValue) * 100 : null
      const costMetric = /inversion|costo|cpl|cpc|cpm/.test(normalize(metric.label))
      const variationTone = variation === null ? 'neutral' : costMetric ? variation <= 0 ? 'good' : 'bad' : variation >= 0 ? 'good' : 'bad'
      return { platform: platform.name, metric: metric.label, current: currentValue, compared: comparedValue, variation, variationTone }
    })
  })
}

function relativeLabel(timestamp: number | null, now: number) {
  if (!timestamp) return 'Esperando primera consulta'
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  return minutes === 0 ? 'Actualizado hace menos de 1 min' : `Actualizado hace ${minutes} min`
}

export function DashboardOverview({ clientId, clientName, period, customRange, periodSelector, platforms, platformMetrics, platformData, loading, updatedAt, onRefresh }: DashboardOverviewProps) {
  const [now, setNow] = useState(() => Date.now())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [comparePreset, setComparePreset] = useState('month-to-date')
  const [comparisonDates, setComparisonDates] = useState({ currentFrom: '', currentTo: '', comparedFrom: '', comparedTo: '' })
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const connectedPlatforms = useMemo(() => platforms.filter((platform) => platform.connected), [platforms])
  const connectedMeta = connectedPlatforms.some((platform) => platform.key === 'meta')
  const connectedPaidMedia = connectedPlatforms.some((platform) => platform.key === 'meta' || platform.key === 'google')
  const range = asRecord(platformData.range)
  const dateFrom = String(range.dateFrom ?? '')
  const dateTo = String(range.dateTo ?? '')

  const { data: budgetData, error: budgetLoadError, mutate: refreshBudget } = useSWR<DashboardBudget>(
    clientId ? `/api/conexa/dashboard/budget?clientId=${encodeURIComponent(clientId)}` : null,
    fetchBudget,
    { refreshInterval: 15 * 60 * 1000, revalidateOnFocus: true, revalidateOnReconnect: true },
  )
  const { data: monthData, mutate: refreshMonthData } = useSWR<DashboardRecord>(
    clientId && connectedPaidMedia ? ['conexa-dashboard-month', clientId] as const : null,
    async ([, selectedClientId]) => {
      const response = await fetch('/api/conexa/data', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId, period: 'Este mes', selectedAccounts: {}, crmFilters: {} }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo consultar el mes en curso.')
      return payload as DashboardRecord
    },
    { refreshInterval: 15 * 60 * 1000, revalidateOnFocus: true },
  )
  const { data: regionData, isLoading: regionLoading, mutate: refreshRegions } = useSWR<{ available: boolean; rows: DashboardRegionRow[]; message?: string }>(
    clientId && connectedMeta && dateFrom && dateTo ? ['conexa-dashboard-meta-regions', clientId, dateFrom, dateTo] as const : null,
    async ([, selectedClientId, startDate, endDate]) => {
      const response = await fetch('/api/conexa/dashboard/meta-regions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId, dateFrom: startDate, dateTo: endDate }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo consultar el desglose regional.')
      return payload as { available: boolean; rows: DashboardRegionRow[]; message?: string }
    },
    { refreshInterval: 15 * 60 * 1000, revalidateOnFocus: true },
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const refreshDashboard = useCallback(() => {
    onRefresh()
    void Promise.allSettled([refreshBudget(), refreshMonthData(), refreshRegions()])
  }, [onRefresh, refreshBudget, refreshMonthData, refreshRegions])

  const uploadBudget = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !clientId) return
    setUploading(true)
    setUploadError(null)
    const form = new FormData()
    form.set('clientId', clientId)
    form.set('file', file)
    try {
      const response = await fetch('/api/conexa/dashboard/budget', { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo subir el presupuesto.')
      await refreshBudget(payload, false)
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'No se pudo subir el presupuesto.')
    } finally {
      setUploading(false)
    }
  }

  const runComparison = async () => {
    if (!clientId) return
    const ranges = getComparisonRanges(comparePreset, comparisonDates)
    if (!ranges) { setComparisonError('Completá las cuatro fechas para comparar.'); return }
    setComparisonLoading(true)
    setComparisonError(null)
    try {
      const [current, compared] = await Promise.all([
        fetchMetricsForRange(clientId, ranges.current),
        fetchMetricsForRange(clientId, ranges.compared),
      ])
      setComparison({ ranges, current, compared })
    } catch (cause) {
      setComparisonError(cause instanceof Error ? cause.message : 'No se pudo comparar este período.')
    } finally {
      setComparisonLoading(false)
    }
  }

  const comparisonRows = comparison ? compareMetricRows(connectedPlatforms, comparison.current, comparison.compared) : []
  const regionRows = regionData?.rows ?? []
  const platformSection = (platform: DashboardPlatform) => {
    const metrics = platformMetrics[platform.key] ?? []
    const sourceKey = platform.key === 'tag_manager' ? 'tag_manager' : platform.key
    const source = asRecord(platformData[sourceKey] ?? (platform.key === 'tag_manager' ? platformData.tagManager : undefined))
    if (platform.key === 'meta') return <MetaDashboardSection key={platform.key} platform={platform} data={source} metrics={metrics} budget={budgetData} monthData={asRecord(monthData)} regionData={regionData} regionLoading={regionLoading} period={period} />
    return <GenericPlatformSection key={platform.key} platform={platform} data={source} metrics={metrics} period={period} budget={budgetData} monthData={asRecord(monthData)} />
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-6 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-[11px] text-[#929292]">{period} · Control de plataformas</p>
            <h1 className="text-balance text-[22px] font-bold tracking-[-.03em] text-[#202020]">Dashboard · {clientName ?? 'Seleccioná un cliente'}</h1>
            <p className="mt-1 text-[12px] leading-5 text-[#777]">Resumen de las plataformas conectadas para el período seleccionado.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {periodSelector}
            <span className="flex items-center gap-1.5 text-[11px] text-[#777]" aria-live="polite"><span className="size-1.5 rounded-full bg-[#1e9e6b]" aria-hidden="true" />{relativeLabel(updatedAt, now)}</span>
            <button type="button" onClick={refreshDashboard} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dededb] bg-white px-3 text-[11px] font-medium text-[#333] transition-colors hover:bg-[#f8f8f6] disabled:cursor-not-allowed disabled:opacity-60" title="Vuelve a consultar las plataformas">
              {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3.5" aria-hidden="true" />}
              Actualizar ahora
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-[#e6e6e3] bg-[#fafaf8] p-4 sm:p-5" aria-label="Archivo de presupuesto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e8e8e5] bg-white"><FileSpreadsheet className="size-4 text-[#5b5fe8]" aria-hidden="true" /></span>
              <div>
                <h2 className="text-[13px] font-semibold text-[#262626]">Presupuesto por cliente</h2>
                {budgetData?.configured ? (
                  <p className="mt-1 text-[10px] text-[#777]">{budgetData.fileName} · {Object.values(budgetData.rowCounts ?? {}).reduce((total, count) => total + count, 0)} filas · reemplazado al subir una nueva versión</p>
                ) : budgetData && !budgetData.canUpload ? <p className="mt-1 text-[10px] text-[#777]">No hay un archivo cargado. Iniciá sesión con permisos sobre este cliente para subirlo.</p> : <p className="mt-1 text-[10px] text-[#777]">{budgetData?.error ?? budgetLoadError?.message ?? 'Subí el libro XLSX o CSV de presupuesto para habilitar consumo, ritmo y alertas.'}</p>}
                <p className="mt-1 text-[10px] text-[#8b6a25]">El archivo se guarda en un bucket público; cualquier persona con el enlace puede descargarlo.</p>
                {budgetData?.publicUrl && <a href={budgetData.publicUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[10px] font-medium text-[#5b5fe8] underline underline-offset-2">Abrir archivo público</a>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input ref={fileInput} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={uploadBudget} className="sr-only" aria-label="Seleccionar archivo de presupuesto" />
              <button type="button" onClick={() => fileInput.current?.click()} disabled={!clientId || uploading || !budgetData?.canUpload} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#5b5fe8] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#4b4fd6] disabled:cursor-not-allowed disabled:opacity-60">
                {uploading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <UploadCloud className="size-3.5" aria-hidden="true" />}
                {uploading ? 'Subiendo…' : 'Subir / reemplazar'}
              </button>
            </div>
          </div>
          {uploadError && <p role="alert" className="mt-3 text-[11px] text-[#b42318]">{uploadError}</p>}
        </section>

        {connectedPlatforms.length > 0 && <section aria-label="Resumen consolidado" className="flex flex-col gap-3">
          <div><h2 className="text-[13px] font-semibold text-[#303030]">Resumen por plataforma</h2><p className="mt-1 text-[10px] text-[#858585]">Los resultados, conversiones, eventos clave y leads se mantienen separados porque representan métricas distintas.</p></div>
          <div className="flex flex-col gap-3">
            {connectedPlatforms.map((platform) => {
              const metrics = platformMetrics[platform.key] ?? []
              const highlightLabels: Record<string, string> = { meta: 'Resultados', google: 'Conversiones', analytics: 'Sesiones', crm: 'Contactos', tag_manager: 'Etiquetas' }
              const highlight = metrics.find((metric) => normalize(metric.label) === normalize(highlightLabels[platform.key] ?? '')) ?? metrics[0]
              const investment = ['meta', 'google'].includes(platform.key) ? metrics.find((metric) => normalize(metric.label).includes('inversion')) : undefined
              return <article key={`summary-${platform.key}`} className="rounded-xl border border-[#e6e6e3] bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center overflow-hidden rounded-md border border-[#ededeb] bg-white">{platform.iconUrl ? <img src={platform.iconUrl} alt="" className="size-5 object-contain" /> : <platform.icon className="size-4 text-[#11A683]" aria-hidden="true" />}</span>
                  <h3 className="text-[11px] font-semibold text-[#555]">{platform.name}</h3>
                </div>
                <p className="text-[10px] text-[#888]">{highlight?.label ?? 'Métrica principal'}</p>
                <p className="mt-1 text-[21px] font-semibold tracking-[-.03em] text-[#202020] tabular-nums">{highlight ? numberFormat.format(Number(highlight.value ?? 0)) : '—'}</p>
                {investment && <p className="mt-2 text-[10px] text-[#777]">Inversión: <strong className="font-semibold text-[#333]">{moneyFormat.format(Number(investment.value ?? 0))}</strong></p>}
              </article>
            })}
          </div>
        </section>}

        <ComparisonSection clientId={clientId} platforms={connectedPlatforms} />

        {!connectedPlatforms.length ? (
          <section className="rounded-2xl border border-dashed border-[#dcdcd8] bg-white px-6 py-12 text-center">
            <h2 className="text-[14px] font-semibold text-[#292929]">No hay plataformas conectadas</h2>
            <p className="mx-auto mt-2 max-w-[420px] text-[12px] leading-5 text-[#777]">Conectá una plataforma para ver sus métricas en este Dashboard.</p>
            <a href="/dashboard/platform" className="mt-4 inline-flex rounded-lg bg-[#5b5fe8] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#4b4fd6]">Ir a Conexiones</a>
          </section>
        ) : (
          <>
            <nav aria-label="Plataformas del Dashboard" className="flex flex-wrap gap-2">
              {connectedPlatforms.map((platform) => <button key={platform.key} type="button" onClick={() => document.getElementById(`dashboard-platform-${platform.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex items-center gap-2 rounded-full border border-[#e6e6e3] bg-white px-3 py-1.5 text-[11px] font-medium text-[#4c4c4c] hover:border-[#c9c9c6] hover:bg-[#fafaf8]">{platform.iconUrl ? <img src={platform.iconUrl} alt="" className="size-4 object-contain" /> : <platform.icon className="size-4 text-[#11A683]" aria-hidden="true" />}{platform.name}<span className="size-1.5 rounded-full bg-[#1e9e6b]" aria-hidden="true" /></button>)}
            </nav>
            <div className="flex flex-col gap-6">{connectedPlatforms.map(platformSection)}</div>
          </>
        )}
      </div>
    </div>
  )
}

function ComparisonSection({ clientId, platforms }: { clientId: string | null; platforms: DashboardPlatform[] }) {
  const [preset, setPreset] = useState('month-to-date')
  const [custom, setCustom] = useState({ currentFrom: '', currentTo: '', comparedFrom: '', comparedTo: '' })
  const [result, setResult] = useState<Comparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rows = result ? compareMetricRows(platforms, result.current, result.compared) : []

  const compare = async () => {
    if (!clientId) return
    const ranges = getComparisonRanges(preset, custom)
    if (!ranges) { setError('Completá las cuatro fechas para comparar.'); return }
    setLoading(true)
    setError(null)
    try {
      const [current, compared] = await Promise.all([fetchMetricsForRange(clientId, ranges.current), fetchMetricsForRange(clientId, ranges.compared)])
      setResult({ ranges, current, compared })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar la comparación.')
    } finally { setLoading(false) }
  }

  return (
    <details className="rounded-2xl border border-[#e6e6e3] bg-white">
      <summary className="cursor-pointer px-5 py-4 text-[13px] font-semibold text-[#292929]">Comparar períodos</summary>
      <div className="border-t border-[#ededeb] p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="flex min-w-[230px] flex-1 flex-col gap-1"><span className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#858585]">Comparación</span><select value={preset} onChange={(event) => setPreset(event.target.value)} className="h-9 rounded-lg border border-[#e6e6e3] bg-white px-2.5 text-[11px]"><option value="month-to-date">Este mes vs mismo tramo del mes anterior</option><option value="last-month">Mes pasado vs anterior</option><option value="7-days">7 días vs 7 anteriores</option><option value="30-days">30 días vs 30 anteriores</option><option value="year">Hoy vs mismo día del año anterior</option><option value="custom">Fechas personalizadas</option></select></label>
          {preset === 'custom' && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><DateField label="Actual desde" value={custom.currentFrom} onChange={(value) => setCustom((old) => ({ ...old, currentFrom: value }))} /><DateField label="Actual hasta" value={custom.currentTo} onChange={(value) => setCustom((old) => ({ ...old, currentTo: value }))} /><DateField label="Comparar desde" value={custom.comparedFrom} onChange={(value) => setCustom((old) => ({ ...old, comparedFrom: value }))} /><DateField label="Comparar hasta" value={custom.comparedTo} onChange={(value) => setCustom((old) => ({ ...old, comparedTo: value }))} /></div>}
          <button type="button" onClick={compare} disabled={!clientId || loading} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#d9d9d6] px-4 text-[11px] font-semibold text-[#333] hover:bg-[#fafaf8] disabled:opacity-60">{loading && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}{loading ? 'Comparando…' : 'Comparar'}</button>
        </div>
        {error && <p role="alert" className="mt-3 text-[11px] text-[#b42318]">{error}</p>}
        {result && <div className="mt-4 flex flex-col gap-2"><p className="text-[10px] text-[#777]">{result.ranges.label}: {result.ranges.current.from}–{result.ranges.current.to} vs {result.ranges.compared.from}–{result.ranges.compared.to}. Las métricas de resultado se conservan por plataforma.</p><DashboardDataTable title="Comparación por plataforma" columns={[{ key: 'platform', label: 'Plataforma' }, { key: 'metric', label: 'Métrica' }, { key: 'current', label: 'Actual', format: 'number', right: true }, { key: 'compared', label: 'Comparado', format: 'number', right: true }, { key: 'variation', label: 'Variación', format: 'percent', toneKey: 'variationTone', right: true }]} rows={rows} searchable={false} emptyMessage="No hay métricas comparables para estas fechas." /></div>}
      </div>
    </details>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 flex-col gap-1"><span className="text-[9px] font-semibold uppercase tracking-[.05em] text-[#858585]">{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-0 rounded-lg border border-[#e6e6e3] px-2 text-[10px]" /></label>
}
