'use client'

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

type PlatformMetric = { label: string; value: number }
type Platform = {
  key: string
  name: string
  color: string
  iconUrl: string | null
  icon: ComponentType<{ className?: string }>
  connected: boolean
}
type DashboardPlatformData = Record<string, unknown>

type DashboardOverviewProps = {
  clientName: string | null
  period: string
  periodSelector: ReactNode
  platforms: Platform[]
  platformMetrics: Record<string, PlatformMetric[]>
  platformData: DashboardPlatformData
  loading: boolean
  updatedAt: number | null
  onRefresh: () => void
}

type TableSection = { title: string; headers: string[]; rows: string[][] }

type DataRecord = Record<string, unknown>

const asRecord = (value: unknown): DataRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as DataRecord : {}
const asRows = (value: unknown): DataRecord[] => Array.isArray(value) ? value.filter((row): row is DataRecord => Boolean(row && typeof row === 'object' && !Array.isArray(row))) : []
const numeric = (value: unknown) => typeof value === 'number' ? value : Number(value ?? 0) || 0
const formatNumber = (value: unknown) => numeric(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const formatMoney = (value: unknown) => `$ ${formatNumber(value)}`
const displayText = (value: unknown) => typeof value === 'string' && value.trim() ? value : '—'

function platformIsUnavailable(key: string, data: DataRecord) {
  if (key !== 'crm') return data.available === false
  const sources = ['contacts', 'opportunities', 'sales', 'acquisition'].map((name) => asRecord(data[name]))
  return sources.every((source) => source.available === false)
}

function platformHasData(key: string, data: DataRecord, metrics: PlatformMetric[]) {
  if (key === 'meta' || key === 'google') {
    return asRows(data.accounts).some((account) => numeric(account.api_rows_received) > 0 || asRows(account.campaigns).length > 0)
  }
  if (key === 'analytics') {
    const reports = asRecord(data.reports)
    return Object.values(reports).some((report) => asRows(report).length > 0)
  }
  if (key === 'tag_manager') return asRows(data.containers).length > 0
  if (key === 'crm') {
    const acquisition = asRecord(data.acquisition)
    const acquisitionTotals = asRecord(acquisition.totals)
    const totals = ['contacts', 'opportunities', 'sales'].map((name) => asRecord(data[name]).totals).map(asRecord)
    return numeric(acquisitionTotals.contacts) > 0 || numeric(acquisitionTotals.sales) > 0 || asRows(acquisition.campaignRows).length > 0 || totals.some((item) => Object.values(item).some((value) => numeric(value) > 0))
  }
  return metrics.some((metric) => numeric(metric.value) > 0)
}

function getTableSections(key: string, data: DataRecord): TableSection[] {
  if (key === 'meta' || key === 'google') {
    const accounts = asRows(data.accounts)
    const rows = accounts.flatMap((account) => asRows(account.campaigns).map((campaign) => {
      const results = numeric(campaign.results ?? campaign.leads ?? campaign.conversions)
      return [
        displayText(campaign.account_name ?? account.account_name),
        displayText(campaign.name ?? campaign.campaign_name),
        formatMoney(campaign.spend ?? campaign.cost),
        formatNumber(campaign.impressions),
        formatNumber(campaign.clicks),
        formatNumber(results),
      ]
    })).slice(0, 8)

    return [{
      title: 'Campañas destacadas',
      headers: ['Cuenta', 'Campaña', key === 'meta' ? 'Inversión' : 'Costo', 'Impresiones', 'Clics', key === 'meta' ? 'Resultados' : 'Conversiones'],
      rows,
    }]
  }

  if (key === 'analytics') {
    const reports = asRecord(data.reports)
    const rows = asRows(reports.acquisition).slice(0, 8).map((row) => [
      displayText(row.firstUserDefaultChannelGroup ?? row.sessionSourceMedium ?? row.firstUserSourceMedium),
      displayText(row.sessionCampaignName),
      formatNumber(row.sessions),
      formatNumber(row.activeUsers ?? row.totalUsers),
      formatNumber(row.keyEvents),
    ])
    return [{ title: 'Adquisición', headers: ['Canal', 'Campaña', 'Sesiones', 'Usuarios', 'Eventos clave'], rows }]
  }

  if (key === 'crm') {
    const acquisition = asRecord(data.acquisition)
    const rows = asRows(acquisition.campaignRows).slice(0, 8).map((row) => [
      displayText(row.label),
      formatNumber(row.contacts),
      formatNumber(row.sales),
    ])
    return [{ title: 'Leads por origen', headers: ['Origen / campaña', 'Contactos', 'Ventas'], rows }]
  }

  if (key === 'tag_manager') {
    const rows = asRows(data.containers).slice(0, 8).map((container) => {
      const diagnostics = asRecord(container.diagnostics)
      return [
        displayText(container.name ?? container.container_name ?? container.publicId),
        formatNumber(diagnostics.totalTags),
        formatNumber(diagnostics.totalTriggers),
        formatNumber(diagnostics.totalVariables),
      ]
    })
    return [{ title: 'Contenedores', headers: ['Contenedor', 'Etiquetas', 'Activadores', 'Variables'], rows }]
  }

  return []
}

function UpdatedLabel({ updatedAt, now }: { updatedAt: number | null; now: number }) {
  if (!updatedAt) return <>Esperando la primera consulta</>
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000))
  return <>Actualizado {minutes === 0 ? 'hace menos de 1 min' : `hace ${minutes} min`}</>
}

function MetricCard({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#e6e6e3] bg-white px-4 py-3">
      <p className="truncate text-[11px] text-[#858585]">{label}</p>
      <p className="mt-1.5 text-[16px] font-semibold tracking-[-.03em] text-[#202020] tabular-nums whitespace-nowrap">{label.toLowerCase().includes('inversión') || label.toLowerCase().includes('costo') ? formatMoney(value) : formatNumber(value)}</p>
    </div>
  )
}

function DataTable({ section }: { section: TableSection }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e6e6e3] bg-white">
      <div className="border-b border-[#ededeb] px-4 py-3">
        <h3 className="text-[12px] font-semibold text-[#303030]">{section.title}</h3>
      </div>
      {section.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[11px]">
            <thead className="bg-[#fafaf8] text-[#777]">
              <tr>{section.headers.map((header) => <th key={header} scope="col" className="px-4 py-2.5 font-medium">{header}</th>)}</tr>
            </thead>
            <tbody>
              {section.rows.map((row, rowIndex) => (
                <tr key={`${section.title}-${rowIndex}`} className="border-t border-[#f0f0ed] text-[#424242]">
                  {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="max-w-[240px] truncate px-4 py-2.5">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-[11px] text-[#8a8a8a]">Sin datos para mostrar en este período.</p>
      )}
    </div>
  )
}

export function DashboardOverview({ clientName, period, periodSelector, platforms, platformMetrics, platformData, loading, updatedAt, onRefresh }: DashboardOverviewProps) {
  const [now, setNow] = useState(() => Date.now())
  const connectedPlatforms = useMemo(() => platforms.filter((platform) => platform.connected), [platforms])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const scrollToPlatform = (key: string) => {
    document.getElementById(`dashboard-platform-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-6 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-[11px] text-[#929292]">{period} · Control de plataformas</p>
            <h1 className="text-balance text-[22px] font-bold tracking-[-.03em] text-[#202020]">Dashboard · {clientName ?? 'Seleccioná un cliente'}</h1>
            <p className="mt-1 text-[12px] leading-5 text-[#777]">Resumen de las plataformas conectadas para el período seleccionado.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {periodSelector}
            <span className="flex items-center gap-1.5 text-[11px] text-[#777]" aria-live="polite">
              <span className="size-1.5 rounded-full bg-[#1e9e6b]" aria-hidden="true" />
              <UpdatedLabel updatedAt={updatedAt} now={now} />
            </span>
            <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dededb] bg-white px-3 text-[11px] font-medium text-[#333] transition-colors hover:bg-[#f8f8f6] disabled:cursor-not-allowed disabled:opacity-60" title="Vuelve a consultar las plataformas">
              {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3.5" aria-hidden="true" />}
              Actualizar ahora
            </button>
          </div>
        </header>

        {!connectedPlatforms.length ? (
          <section className="rounded-2xl border border-dashed border-[#dcdcd8] bg-white px-6 py-12 text-center">
            <h2 className="text-[14px] font-semibold text-[#292929]">No hay plataformas conectadas</h2>
            <p className="mx-auto mt-2 max-w-[420px] text-[12px] leading-5 text-[#777]">Conectá una plataforma para ver sus métricas en este Dashboard.</p>
            <a href="/dashboard/platform" className="mt-4 inline-flex rounded-lg bg-[#5b5fe8] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#4b4fd6]">Ir a Conexiones</a>
          </section>
        ) : (
          <>
            <nav aria-label="Plataformas del Dashboard" className="flex flex-wrap gap-2">
              {connectedPlatforms.map((platform) => (
                <button key={platform.key} type="button" onClick={() => scrollToPlatform(platform.key)} className="inline-flex items-center gap-2 rounded-full border border-[#e6e6e3] bg-white px-3 py-1.5 text-[11px] font-medium text-[#4c4c4c] hover:border-[#c9c9c6] hover:bg-[#fafaf8]">
                  {platform.iconUrl ? <img src={platform.iconUrl} alt="" className="size-4 object-contain" /> : <platform.icon className="size-4 text-[#11A683]" aria-hidden="true" />}
                  {platform.name}
                  <span className="size-1.5 rounded-full bg-[#1e9e6b]" aria-hidden="true" />
                </button>
              ))}
            </nav>

            <section aria-label="Resumen por plataforma" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {connectedPlatforms.map((platform) => {
                const metrics = platformMetrics[platform.key] ?? []
                const source = asRecord(platformData[platform.key])
                const unavailable = platformIsUnavailable(platform.key, source) || !platformHasData(platform.key, source, metrics)
                const sections = getTableSections(platform.key, source)
                return (
                  <article id={`dashboard-platform-${platform.key}`} key={platform.key} className="scroll-mt-4 rounded-2xl border border-[#e6e6e3] bg-[#fafaf8] p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#ededeb] bg-white">
                          {platform.iconUrl ? <img src={platform.iconUrl} alt="" className="size-6 object-contain" /> : <platform.icon className="size-5 text-[#11A683]" aria-hidden="true" />}
                        </span>
                        <h2 className="truncate text-[15px] font-semibold text-[#252525]">{platform.name}</h2>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-[#27845e]"><span className="size-1.5 rounded-full bg-[#1e9e6b]" aria-hidden="true" />Conectada</span>
                    </div>

                    {unavailable ? (
                      <div className="rounded-xl border border-dashed border-[#dededb] bg-white px-4 py-6 text-center">
                        <p className="text-[12px] font-medium text-[#424242]">Sin datos disponibles</p>
                        <p className="mt-1 text-[11px] text-[#858585]">No hay información para este cliente y período.</p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {metrics.map((metric) => <MetricCard key={`${platform.key}-${metric.label}`} label={metric.label} value={metric.value} />)}
                        </div>
                        <div className="flex flex-col gap-3">
                          {sections.map((section) => <DataTable key={`${platform.key}-${section.title}`} section={section} />)}
                        </div>
                      </>
                    )}
                  </article>
                )
              })}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
