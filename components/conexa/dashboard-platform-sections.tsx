'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { DashboardDataTable, type DashboardColumn } from '@/components/conexa/dashboard-data-table'
import type { DashboardBudget, DashboardMetric, DashboardPlatform, DashboardRecord, DashboardRegionRow } from '@/components/conexa/dashboard-types'

const asRecord = (value: unknown): DashboardRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as DashboardRecord : {}
const asRows = (value: unknown): DashboardRecord[] => Array.isArray(value) ? value.filter((row): row is DashboardRecord => Boolean(row && typeof row === 'object' && !Array.isArray(row))) : []
const numberValue = (value: unknown) => typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.')) || 0
const numberFormat = (value: unknown) => numberValue(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const moneyFormat = (value: unknown) => `$ ${numberFormat(value)}`
const decimalFormat = (value: unknown) => numberValue(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const display = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value)
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

function field(row: DashboardRecord, ...names: string[]) {
  const wanted = new Set(names.map(normalize))
  const entry = Object.entries(row).find(([key]) => wanted.has(normalize(key)))
  return entry?.[1]
}

function amount(row: DashboardRecord, ...names: string[]) {
  return numberValue(field(row, ...names))
}

function percentValue(value: unknown) {
  const parsed = numberValue(value)
  if (!parsed) return 0
  if (String(value ?? '').includes('%')) return parsed
  return parsed <= 1 ? parsed * 100 : parsed
}

function monthlyBudgetRow(row: DashboardRecord) {
  const assigned = amount(row, 'Presupuesto Mensual asignado')
  if (assigned > 0) return assigned
  const general = amount(row, 'Presupuesto General asignado')
  const percentage = percentValue(field(row, '%'))
  return general > 0 && percentage > 0 ? general * percentage / 100 : general
}

function accountName(row: DashboardRecord) {
  return String(row.account_name ?? row.accountName ?? row.name ?? row.id_cuenta ?? row.account_id ?? row.customerId ?? 'Cuenta')
}

function channelLabel(resultType: unknown) {
  const value = normalize(resultType)
  if (value.includes('messaging') || value.includes('whatsapp')) return 'WhatsApp'
  if (value.includes('lead')) return 'Formulario'
  if (value.includes('purchase')) return 'Compra'
  if (value.includes('registration')) return 'Registro'
  return value ? String(resultType) : 'Otro'
}

function metricValue(metrics: DashboardMetric[], ...labels: string[]) {
  const wanted = new Set(labels.map(normalize))
  return metrics.find((metric) => wanted.has(normalize(metric.label)))?.value ?? 0
}

function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: unknown; money?: boolean; percent?: boolean }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 rounded-xl border border-[#e6e6e3] bg-white px-3 py-3">
          <p className="truncate text-[10px] text-[#858585]">{metric.label}</p>
          <p className="mt-1.5 whitespace-nowrap text-[16px] font-semibold tracking-[-.03em] text-[#202020] tabular-nums">
            {metric.value === 'No disponible' ? metric.value : metric.percent ? `${decimalFormat(metric.value)}%` : metric.money ? moneyFormat(metric.value) : numberFormat(metric.value)}
          </p>
        </div>
      ))}
    </div>
  )
}

function FilterField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="flex min-w-[140px] flex-1 flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#858585]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg border border-[#e6e6e3] bg-white px-2.5 text-[11px] text-[#333] outline-none focus:border-[#5b5fe8]">
        <option value="all">Todas</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h3 className="text-[12px] font-semibold text-[#2c2c2c]">{title}</h3>
      {detail && <span className="text-[10px] text-[#888]">{detail}</span>}
    </div>
  )
}

function EmptyPanel({ text = 'Sin datos disponibles para este período.' }: { text?: string }) {
  return <div className="rounded-xl border border-dashed border-[#dededb] bg-white px-4 py-7 text-center text-[11px] text-[#858585]">{text}</div>
}

function metaAccounts(data: DashboardRecord) {
  return asRows(data.accounts)
}

function googleAccounts(data: DashboardRecord) {
  return asRows(data.accounts)
}

function budgetRowsForAccount(rows: DashboardRecord[], name: string) {
  const key = normalize(name)
  return key ? rows.filter((row) => normalize(field(row, 'Cuenta', 'Account')) === key) : []
}

function monthlyBudget(rows: DashboardRecord[]) {
  const groups = new Map<string, { general: number; detail: number }>()
  for (const row of rows) {
    const groupKey = [
      field(row, 'Marca'),
      field(row, 'Modalidad'),
      field(row, 'Objetivo'),
      field(row, 'Tipo de resultado'),
    ].map(normalize).join('|')
    const current = groups.get(groupKey) ?? { general: 0, detail: 0 }
    current.general = Math.max(current.general, amount(row, 'Presupuesto General asignado'))
    current.detail += amount(row, 'Presupuesto Mensual asignado')
    groups.set(groupKey, current)
  }
  return [...groups.values()].reduce((sum, group) => sum + (group.general || group.detail), 0)
}

function monthToken(value: unknown) {
  const key = normalize(value).slice(0, 3)
  const months: Record<string, string> = {
    ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04', may: '05', jun: '06', jul: '07',
    ago: '08', aug: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12', dec: '12',
  }
  if (/^\d{1,2}$/.test(key)) return key.padStart(2, '0')
  return months[key] ?? ''
}

function argentinaMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) }
}

function monthDays(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function makeMetaCampaignRows(campaigns: DashboardRecord[], accounts: DashboardRecord[]) {
  const nameById = new Map(accounts.map((account) => [String(account.account_id ?? account.id ?? ''), accountName(account)]))
  return campaigns.map((campaign) => ({
    account: campaign.account_name ?? nameById.get(String(campaign.account_id ?? '')) ?? 'Cuenta',
    campaign: campaign.name ?? campaign.campaign_name ?? 'Campaña sin nombre',
    objective: campaign.objective ?? '—',
    status: campaign.status ?? campaign.effective_status ?? '—',
    resultType: channelLabel(campaign.result_type),
    spend: numberValue(campaign.spend),
    impressions: numberValue(campaign.impressions),
    reach: numberValue(campaign.reach),
    clicks: numberValue(campaign.clicks),
    results: numberValue(campaign.results ?? campaign.leads ?? campaign.conversions),
    costPerResult: numberValue(campaign.cost_per_result ?? campaign.cpl),
    ctr: numberValue(campaign.ctr),
    cpm: campaign.impressions ? numberValue(campaign.spend) / numberValue(campaign.impressions) * 1000 : 0,
  }))
}

function sum(rows: DashboardRecord[], key: string) {
  return rows.reduce((total, row) => total + numberValue(row[key]), 0)
}

const chartConfig = {
  spend: { label: 'Inversión', color: 'var(--chart-1)' },
  results: { label: 'Resultados', color: 'var(--chart-2)' },
  conversions: { label: 'Conversiones', color: 'var(--chart-3)' },
  leads: { label: 'Leads', color: 'var(--chart-4)' },
} satisfies ChartConfig

function monthProgress() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)
  return { elapsed: day, days: new Date(Date.UTC(year, month, 0)).getUTCDate(), remaining: Math.max(0, new Date(Date.UTC(year, month, 0)).getUTCDate() - day) }
}

function calculateAccountBudgets(accounts: DashboardRecord[], monthAccounts: DashboardRecord[], rows: DashboardRecord[]) {
  const progress = monthProgress()
  return accounts.map((account) => {
    const name = accountName(account)
    const assigned = monthlyBudget(budgetRowsForAccount(rows, name))
    const monthlyAccount = monthAccounts.find((candidate) => normalize(accountName(candidate)) === normalize(name))
    const consumed = numberValue(asRecord(monthlyAccount?.totals).spend)
    const consumption = assigned ? consumed / assigned * 100 : 0
    const pace = progress.days ? progress.elapsed / progress.days * 100 : 0
    const projected = progress.elapsed ? consumed / progress.elapsed * progress.days : 0
    const suggestedDaily = progress.remaining > 0 ? Math.max(0, (assigned - consumed) / progress.remaining) : 0
    const status = !assigned ? 'Sin presupuesto asignado' : consumption > 100 ? 'Sobre presupuesto' : projected > assigned * 1.1 ? 'Proyección > 110%' : consumption < pace * 0.85 ? 'Debajo del ritmo' : 'En ritmo'
    return { account: name, assigned, consumed, consumption, pace, projected, suggestedDaily, status }
  })
}

function BudgetByAccount({ platformName, rows }: { platformName: string; rows: ReturnType<typeof calculateAccountBudgets> }) {
  const tableRows = rows
  return (
    <div className="mt-5 flex flex-col gap-3">
      <SectionHeading title={`Presupuesto vs consumo · ${platformName}`} detail="Mes en curso; importes tomados del archivo del cliente." />
      <DashboardDataTable title="Totales por cuenta" searchable={false} columns={[
        { key: 'account', label: 'Cuenta' }, { key: 'assigned', label: 'Presupuesto mensual', format: 'money', right: true },
        { key: 'consumed', label: 'Consumido', format: 'money', right: true }, { key: 'consumption', label: '% consumo', format: 'percent', right: true },
        { key: 'pace', label: 'Ritmo esperado', format: 'percent', right: true }, { key: 'projected', label: 'Proyección', format: 'money', right: true },
        { key: 'suggestedDaily', label: 'Diario sugerido', format: 'money', right: true }, { key: 'status', label: 'Estado' },
      ]} rows={tableRows} emptyMessage="No hay cuentas publicitarias activas para este cliente." />
    </div>
  )
}

function GeneralCampaignBudget({ rows, accounts, campaigns, monthFilter }: { rows: DashboardRecord[]; accounts: DashboardRecord[]; campaigns: DashboardRecord[]; monthFilter: string }) {
  const accountNames = new Set(accounts.map((account) => normalize(accountName(account))))
  const rowsForMonth = rows.filter((row) => {
    const month = String(field(row, 'Mes') ?? '')
    const selectedMatches = monthFilter === 'all' || monthToken(month) === monthToken(monthFilter)
    return selectedMatches && accountNames.has(normalize(field(row, 'Cuenta')))
  })
  const tableRows = rowsForMonth.map((row) => {
    const account = String(field(row, 'Cuenta') ?? '')
    const campaign = String(field(row, 'Campaña') ?? '')
    const actual = campaigns.filter((item) => normalize(item.account_name) === normalize(account) && normalize(item.name ?? item.campaign_name) === normalize(campaign)).reduce((total, item) => total + numberValue(item.spend), 0)
    const budget = amount(row, 'Inversión (ARS)', 'Inversión', 'Presupuesto Mensual asignado')
    return { account, campaign, month: display(field(row, 'Mes')), brand: display(field(row, 'Marca')), modality: display(field(row, 'Modalidad')), resultType: display(field(row, 'Tipo de resultado')), budget, actual, consumption: budget ? actual / budget * 100 : 0, status: budget ? actual > budget ? 'Sobre presupuesto' : 'En seguimiento' : 'Sin presupuesto' }
  })
  return (
    <DashboardDataTable title="Presupuesto general por campaña" description="Cruce por nombre exacto de cuenta y campaña; el mes del archivo se interpreta en el año actual." searchable columns={[
      { key: 'account', label: 'Cuenta' }, { key: 'campaign', label: 'Campaña' }, { key: 'brand', label: 'Marca' }, { key: 'modality', label: 'Modalidad' },
      { key: 'resultType', label: 'Tipo de resultado' }, { key: 'month', label: 'Mes' }, { key: 'budget', label: 'Presupuesto', format: 'money', right: true },
      { key: 'actual', label: 'Consumido', format: 'money', right: true }, { key: 'consumption', label: '% consumo', format: 'percent', right: true }, { key: 'status', label: 'Estado' },
    ]} rows={tableRows} emptyMessage="No hay líneas de presupuesto general que coincidan con las cuentas activas y el mes seleccionado." />
  )
}

export type MetaDashboardProps = {
  platform: DashboardPlatform
  data: DashboardRecord
  metrics: DashboardMetric[]
  budget?: DashboardBudget
  monthData: DashboardRecord
  regionData?: { available?: boolean; rows?: DashboardRegionRow[]; message?: string }
  regionLoading: boolean
}

export function MetaDashboardSection({ platform, data, metrics, budget, monthData, regionData, regionLoading }: MetaDashboardProps) {
  const accounts = metaAccounts(data)
  const campaigns = accounts.flatMap((account) => asRows(account.campaigns).map((campaign) => ({ ...campaign, account_id: account.account_id, account_name: accountName(account) })))
  const adsets = accounts.flatMap((account) => asRows(account.adsets).map((adset) => ({ ...adset, account_id: account.account_id, account_name: accountName(account) })))
  const ads = accounts.flatMap((account) => asRows(account.ads).map((ad) => ({ ...ad, account_id: account.account_id, account_name: accountName(account) })))
  const budgetRows = asRows(budget?.sheets?.meta)
  const objectiveRows = asRows(budget?.sheets?.objetivosCpl)
  const generalRows = asRows(budget?.sheets?.general)
  const [accountFilter, setAccountFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('')
  const [objectiveFilter, setObjectiveFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [modalityFilter, setModalityFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [dailyMetric, setDailyMetric] = useState<'spend' | 'results'>('spend')

  const uniqueBudgetValues = (column: string) => [...new Set(budgetRows.map((row) => display(field(row, column))).filter((value) => value !== '—' && value.trim()))].sort((left, right) => left.localeCompare(right, 'es'))
  const accountsList = [...new Set(accounts.map(accountName))].sort((left, right) => left.localeCompare(right, 'es'))
  const objectives = [...new Set(campaigns.map((campaign) => display(campaign.objective)).filter((value) => value !== '—'))].sort()
  const statuses = [...new Set(campaigns.map((campaign) => display(campaign.status ?? campaign.effective_status)).filter((value) => value !== '—'))].sort()
  const channels = [...new Set(campaigns.map((campaign) => channelLabel(campaign.result_type)))].sort()
  const brands = uniqueBudgetValues('Marca')
  const models = uniqueBudgetValues('Modelos')
  const modalities = uniqueBudgetValues('Modalidad')
  const months = [...new Set(generalRows.map((row) => display(field(row, 'Mes'))).filter((value) => value !== '—'))].sort()
  const filteredCampaigns = campaigns.filter((campaign) => {
    const campaignName = String(campaign.name ?? campaign.campaign_name ?? '')
    const campaignText = normalize(`${campaignName} ${campaign.objective ?? ''} ${campaign.result_type ?? ''}`)
    if (accountFilter !== 'all' && normalize(campaign.account_name) !== normalize(accountFilter)) return false
    if (campaignFilter && !campaignText.includes(normalize(campaignFilter))) return false
    if (objectiveFilter !== 'all' && normalize(campaign.objective) !== normalize(objectiveFilter)) return false
    if (statusFilter !== 'all' && normalize(campaign.status ?? campaign.effective_status) !== normalize(statusFilter)) return false
    if (channelFilter !== 'all' && normalize(channelLabel(campaign.result_type)) !== normalize(channelFilter)) return false
    if (brandFilter !== 'all' && !campaignText.includes(normalize(brandFilter))) return false
    if (modelFilter !== 'all' && normalize(modelFilter) !== 'general' && !campaignText.includes(normalize(modelFilter))) return false
    if (modalityFilter !== 'all' && !campaignText.includes(normalize(modalityFilter))) return false
    return true
  })

  const totals = {
    spend: sum(filteredCampaigns, 'spend'),
    impressions: sum(filteredCampaigns, 'impressions'),
    reach: sum(filteredCampaigns, 'reach'),
    clicks: sum(filteredCampaigns, 'clicks'),
    results: filteredCampaigns.reduce((total, campaign) => total + numberValue(campaign.results ?? campaign.leads ?? campaign.conversions), 0),
    messaging: filteredCampaigns.filter((campaign) => normalize(campaign.result_type).includes('messaging')).reduce((total, campaign) => total + numberValue(campaign.results), 0),
    formLeads: filteredCampaigns.filter((campaign) => normalize(campaign.result_type).includes('lead')).reduce((total, campaign) => total + numberValue(campaign.results ?? campaign.leads), 0),
  }
  const kpis = [
    { label: 'Gasto', value: totals.spend, money: true },
    { label: 'Resultados', value: totals.results },
    { label: 'Costo por resultado', value: totals.results ? totals.spend / totals.results : 0, money: true },
    { label: 'Conversaciones WA', value: totals.messaging },
    { label: 'Leads formulario', value: totals.formLeads },
    { label: 'Clics', value: totals.clicks },
    { label: 'Impresiones', value: totals.impressions },
    { label: 'CTR', value: totals.impressions ? totals.clicks / totals.impressions * 100 : 0, percent: true },
    { label: 'CPM', value: totals.impressions ? totals.spend / totals.impressions * 1000 : 0, money: true },
  ]

  const dailyMap = new Map<string, { date: string; spend: number; results: number }>()
  for (const account of accounts) {
    if (accountFilter !== 'all' && normalize(accountName(account)) !== normalize(accountFilter)) continue
    for (const point of asRows(account.daily)) {
      const date = String(point.date ?? '')
      if (!date) continue
      const current = dailyMap.get(date) ?? { date, spend: 0, results: 0 }
      current.spend += numberValue(point.spend)
      current.results += numberValue(point.results)
      dailyMap.set(date, current)
    }
  }
  const dailyRows = [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date))
  const regionRows = (regionData?.rows ?? []).slice(0, 8)
  const regionConfig = { results: { label: 'Resultados', color: 'var(--chart-1)' } } satisfies ChartConfig
  const monthMetaAccounts = metaAccounts(asRecord(monthData.meta))
  const monthMetaCampaignRows = makeMetaCampaignRows(monthMetaAccounts.flatMap((account) => asRows(account.campaigns).map((campaign) => ({ ...campaign, account_id: account.account_id, account_name: accountName(account) }))))
  const budgetSummary = calculateAccountBudgets(accounts, monthMetaAccounts, budgetRows)
  const alertItems = buildBudgetAlerts(budgetSummary, objectiveRows, filteredCampaigns)
  const metaColumns: DashboardColumn[] = [
    { key: 'account', label: 'Cuenta' }, { key: 'campaign', label: 'Campaña' }, { key: 'objective', label: 'Objetivo' },
    { key: 'status', label: 'Estado' }, { key: 'spend', label: 'Inversión', format: 'money', right: true },
    { key: 'impressions', label: 'Impresiones', format: 'number', right: true }, { key: 'clicks', label: 'Clics', format: 'number', right: true },
    { key: 'results', label: 'Resultados', format: 'number', right: true }, { key: 'costPerResult', label: 'Costo x resultado', format: 'money', right: true },
    { key: 'ctr', label: 'CTR', format: 'percent', right: true }, { key: 'cpm', label: 'CPM', format: 'money', right: true },
  ]
  const campaignRows = makeMetaCampaignRows(filteredCampaigns)
  const adsetRows = adsets.filter((row) => accountFilter === 'all' || normalize(row.account_name) === normalize(accountFilter)).map((row) => ({
    account: row.account_name, campaign: row.campaign_name, adset: row.name, status: row.status ?? row.effective_status ?? '—',
    spend: numberValue(row.spend), impressions: numberValue(row.impressions), clicks: numberValue(row.clicks), results: numberValue(row.results ?? row.leads ?? row.conversions),
    costPerResult: numberValue(row.cost_per_result ?? row.cpl), resultType: channelLabel(row.result_type),
  }))
  const adRows = ads.filter((row) => accountFilter === 'all' || normalize(row.account_name) === normalize(accountFilter)).map((row) => ({
    account: row.account_name, campaign: row.campaign_name, adset: row.adset_name, ad: row.name, status: row.status ?? row.effective_status ?? '—',
    spend: numberValue(row.spend), impressions: numberValue(row.impressions), clicks: numberValue(row.clicks), results: numberValue(row.results ?? row.leads ?? row.conversions),
    costPerResult: numberValue(row.cost_per_result ?? row.cpl), previewUrl: row.preview_url ?? row.preview_shareable_link ?? '',
  }))

  return (
    <section id="dashboard-platform-meta" className="scroll-mt-5 rounded-2xl border border-[#e6e6e3] bg-[#fafaf8] p-4 sm:p-5">
      <PlatformSectionHeader platform={platform} detail="Meta Ads · rendimiento y presupuesto" />
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-[#e6e6e3] bg-white p-3">
        <FilterField label="Cuenta" value={accountFilter} options={accountsList} onChange={setAccountFilter} />
        <label className="flex min-w-[170px] flex-1 flex-col gap-1"><span className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#858585]">Campaña</span><input value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} placeholder="Buscar campaña" className="h-9 rounded-lg border border-[#e6e6e3] px-2.5 text-[11px] outline-none focus:border-[#5b5fe8]" /></label>
        <FilterField label="Objetivo" value={objectiveFilter} options={objectives} onChange={setObjectiveFilter} />
        <FilterField label="Canal" value={channelFilter} options={channels} onChange={setChannelFilter} />
        <FilterField label="Estado" value={statusFilter} options={statuses} onChange={setStatusFilter} />
        <FilterField label="Marca" value={brandFilter} options={brands} onChange={setBrandFilter} />
        <FilterField label="Modelo" value={modelFilter} options={models} onChange={setModelFilter} />
        <FilterField label="Modalidad" value={modalityFilter} options={modalities} onChange={setModalityFilter} />
        {months.length > 0 && <FilterField label="Mes del presupuesto" value={monthFilter} options={months} onChange={setMonthFilter} />}
        <button type="button" onClick={() => { setAccountFilter('all'); setCampaignFilter(''); setObjectiveFilter('all'); setChannelFilter('all'); setStatusFilter('all'); setBrandFilter('all'); setModelFilter('all'); setModalityFilter('all'); setMonthFilter('all') }} className="h-9 rounded-lg px-3 text-[11px] font-medium text-[#6a6a6a] underline underline-offset-2">Limpiar filtros</button>
      </div>

      <MetricGrid metrics={kpis} />

      <div className="mt-5 rounded-xl border border-[#e6e6e3] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><SectionHeading title="Evolución diaria por cuenta" detail={period} /><p className="text-[10px] text-[#878787]">Los datos se agrupan por cuenta publicitaria; el selector de cuenta filtra la serie.</p></div>
          <select value={dailyMetric} onChange={(event) => setDailyMetric(event.target.value as 'spend' | 'results')} aria-label="Métrica de evolución diaria" className="h-8 rounded-lg border border-[#e6e6e3] bg-white px-2.5 text-[11px]">
            <option value="spend">Inversión</option><option value="results">Resultados</option>
          </select>
        </div>
        {dailyRows.length ? (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <LineChart accessibilityLayer data={dailyRows} margin={{ left: 8, right: 10, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value: string) => value.slice(5)} />
              <YAxis tickLine={false} axisLine={false} width={54} tickFormatter={(value: number) => numberFormat.format(value)} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => String(label)} />} />
              <Line type="monotone" dataKey={dailyMetric} stroke={dailyMetric === 'spend' ? 'var(--color-spend)' : 'var(--color-results)'} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        ) : <EmptyPanel text="No hay evolución diaria disponible en las herramientas de Meta para este período." />}
      </div>

      <BudgetByAccount platformName="Meta Ads" rows={budgetSummary} />
      <GeneralCampaignBudget rows={generalRows} monthFilter={monthFilter} campaigns={monthMetaCampaignRows} accounts={accounts} />

      <div className="mt-5 rounded-xl border border-[#e6e6e3] bg-white p-4">
        <SectionHeading title="Leads por provincia" detail="Meta solo informa esta dimensión cuando está disponible en la cuenta." />
        {regionLoading ? <EmptyPanel text="Cargando desglose regional…" /> : regionRows.length ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.5fr]">
            <ChartContainer config={regionConfig} className="h-[260px] w-full">
              <BarChart accessibilityLayer data={regionRows} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="region" width={112} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="results" fill="var(--color-results)" radius={4} />
              </BarChart>
            </ChartContainer>
            <DashboardDataTable title="Detalle por provincia" columns={[
              { key: 'region', label: 'Provincia' }, { key: 'results', label: 'Resultados', format: 'number', right: true },
              { key: 'percent_of_results', label: '% del total', format: 'percent', right: true }, { key: 'spend', label: 'Inversión', format: 'money', right: true },
              { key: 'cost_per_result', label: 'Costo por resultado', format: 'money', right: true }, { key: 'impressions', label: 'Impresiones', format: 'number', right: true },
              { key: 'clicks', label: 'Clics', format: 'number', right: true },
            ]} rows={regionRows} maxRows={8} />
          </div>
        ) : <EmptyPanel text={regionData?.message ?? 'No hay desglose por provincia disponible para este cliente y período.'} />}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <DashboardDataTable title="Campañas" columns={metaColumns} rows={campaignRows} emptyMessage="Sin campañas con datos para el período seleccionado." />
        <DashboardDataTable title="Conjuntos de anuncios" columns={[
          { key: 'account', label: 'Cuenta' }, { key: 'campaign', label: 'Campaña' }, { key: 'adset', label: 'Conjunto' }, { key: 'status', label: 'Estado' },
          { key: 'spend', label: 'Inversión', format: 'money', right: true }, { key: 'impressions', label: 'Impresiones', format: 'number', right: true },
          { key: 'clicks', label: 'Clics', format: 'number', right: true }, { key: 'results', label: 'Resultados', format: 'number', right: true },
          { key: 'costPerResult', label: 'Costo x resultado', format: 'money', right: true }, { key: 'resultType', label: 'Tipo de resultado' },
        ]} rows={adsetRows} emptyMessage="Sin conjuntos de anuncios con datos para el período seleccionado." />
        <DashboardDataTable title="Anuncios" columns={[
          { key: 'account', label: 'Cuenta' }, { key: 'campaign', label: 'Campaña' }, { key: 'adset', label: 'Conjunto' }, { key: 'ad', label: 'Anuncio' },
          { key: 'spend', label: 'Inversión', format: 'money', right: true }, { key: 'impressions', label: 'Impresiones', format: 'number', right: true },
          { key: 'clicks', label: 'Clics', format: 'number', right: true }, { key: 'results', label: 'Resultados', format: 'number', right: true },
          { key: 'previewUrl', label: 'Vista previa', link: true },
        ]} rows={adRows} emptyMessage="Sin anuncios con datos para el período seleccionado." />
      </div>

      <AlertGroups critical={alertItems.filter((item) => item.severity === 'critical')} attention={alertItems.filter((item) => item.severity !== 'critical')} />
    </section>
  )
}

export type GenericPlatformSectionProps = {
  platform: DashboardPlatform
  data: DashboardRecord
  metrics: DashboardMetric[]
  period: string
  budget?: DashboardBudget
  monthData?: DashboardRecord
}

export function GenericPlatformSection({ platform, data, metrics, period, budget, monthData = {} }: GenericPlatformSectionProps) {
  const unavailable = data.available === false || !genericHasData(platform.key, data, metrics)
  const tables = genericTables(platform.key, data)
  const daily = genericDaily(platform.key, data)
  const googleAccountList = platform.key === 'google' ? googleAccounts(data) : []
  const monthlyGoogleAccounts = googleAccounts(asRecord(monthData.google))
  const googleBudgetSummary = calculateAccountBudgets(googleAccountList, monthlyGoogleAccounts, asRows(budget?.sheets?.google))
  const generalBudgetRows = asRows(budget?.sheets?.general)
  const monthlyGoogleCampaigns = monthlyGoogleAccounts.flatMap((account) => asRows(account.campaigns).map((campaign) => ({ ...campaign, account_name: accountName(account) })))
  return (
    <section id={`dashboard-platform-${platform.key}`} className="scroll-mt-5 rounded-2xl border border-[#e6e6e3] bg-[#fafaf8] p-4 sm:p-5">
      <PlatformSectionHeader platform={platform} detail={platform.key === 'analytics' ? 'Tráfico y eventos del sitio' : platform.key === 'crm' ? 'Resultados comerciales agregados' : platform.key === 'tag_manager' ? 'Contenedores, etiquetas y activadores' : 'Rendimiento de campañas'} />
      {unavailable ? (
        <EmptyPanel text="Sin datos disponibles para este cliente y período." />
      ) : (
        <>
          {metrics.length > 0 && <MetricGrid metrics={metrics.map((metric) => ({ label: platform.key === 'analytics' && normalize(metric.label) === 'conversiones' ? 'Eventos clave' : metric.label, value: metric.value, money: normalize(metric.label).includes('inversion') }))} />}
          {daily.length > 0 && <DailyPlatformChart platformKey={platform.key} period={period} rows={daily} />}
          {platform.key === 'google' && <>
            <BudgetByAccount platformName="Google Ads" rows={googleBudgetSummary} />
            <GeneralCampaignBudget rows={generalBudgetRows} monthFilter="all" accounts={googleAccountList} campaigns={monthlyGoogleCampaigns} />
          </>}
          <div className="mt-4 flex flex-col gap-4">
            {tables.map((table) => <DashboardDataTable key={`${platform.key}-${table.title}`} title={table.title} columns={table.columns} rows={table.rows} emptyMessage={table.emptyMessage} />)}
          </div>
          {platform.key === 'analytics' && <p className="mt-4 rounded-lg border border-[#e6e6e3] bg-white px-3 py-2.5 text-[10px] leading-4 text-[#777]">Analytics mide tráfico y eventos del sitio; sus eventos clave no se suman a las conversiones de las plataformas publicitarias.</p>}
          {platform.key === 'crm' && <p className="mt-4 rounded-lg border border-[#e6e6e3] bg-white px-3 py-2.5 text-[10px] leading-4 text-[#777]">El CRM se muestra en forma agregada; no se incluyen nombres, teléfonos ni correos de contactos.</p>}
        </>
      )}
    </section>
  )
}

function PlatformSectionHeader({ platform, detail }: { platform: DashboardPlatform; detail: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#ededeb] bg-white">
          {platform.iconUrl ? <img src={platform.iconUrl} alt="" className="size-8 object-contain" /> : <platform.icon className="size-6 text-[#11A683]" aria-hidden="true" />}
        </span>
        <div className="min-w-0"><h2 className="truncate text-[16px] font-semibold text-[#222]">{platform.name}</h2><p className="text-[10px] text-[#858585]">{detail}</p></div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-[#27845e]"><span className="size-1.5 rounded-full bg-[#1e9e6b]" aria-hidden="true" />Conectada</span>
    </div>
  )
}

function DailyPlatformChart({ platformKey, period, rows }: { platformKey: string; period: string; rows: DashboardRecord[] }) {
  const firstDataKey = platformKey === 'analytics' ? 'sessions' : platformKey === 'google' ? 'spend' : 'activeUsers'
  const config = { value: { label: firstDataKey === 'sessions' ? 'Sesiones' : firstDataKey === 'spend' ? 'Inversión' : 'Usuarios activos', color: 'var(--chart-1)' } } satisfies ChartConfig
  return (
    <div className="mt-4 rounded-xl border border-[#e6e6e3] bg-white p-4">
      <SectionHeading title="Evolución diaria" detail={period} />
      <ChartContainer config={config} className="h-[220px] w-full">
        <LineChart accessibilityLayer data={rows} margin={{ left: 8, right: 10, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value: string) => String(value).slice(5)} />
          <YAxis tickLine={false} axisLine={false} width={54} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => String(label)} />} />
          <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"><h3 className="text-[12px] font-semibold text-[#2c2c2c]">{title}</h3>{detail && <span className="text-[10px] text-[#888]">{detail}</span>}</div>
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#dededb] bg-white px-4 py-7 text-center text-[11px] text-[#858585]">{text}</div>
}

function genericHasData(key: string, data: DashboardRecord, metrics: DashboardMetric[]) {
  if (key === 'analytics') {
    const reports = asRecord(data.reports)
    return Object.values(reports).some((value) => asRows(value).length > 0)
  }
  if (key === 'crm') {
    const acquisition = asRecord(data.acquisition)
    const totals = asRecord(acquisition.totals)
    return Object.values(totals).some((value) => numberValue(value) > 0) || ['contacts', 'opportunities', 'sales'].some((item) => Object.values(asRecord(asRecord(data[item]).totals)).some((value) => numberValue(value) > 0))
  }
  if (key === 'tag_manager') return asRows(data.containers).length > 0
  const accounts = asRows(data.accounts)
  return accounts.some((account) => numberValue(account.api_rows_received) > 0 || asRows(account.campaigns).length > 0) || metrics.some((metric) => numberValue(metric.value) > 0)
}

function genericDaily(key: string, data: DashboardRecord) {
  if (key === 'analytics') {
    const reports = asRecord(data.reports)
    return asRows(reports.byDay).map((row) => ({ date: row.date, value: numberValue(row.sessions) }))
  }
  if (key === 'google') {
    const byDate = new Map<string, number>()
    for (const account of asRows(data.accounts)) for (const row of asRows(account.daily)) byDate.set(String(row.date ?? ''), (byDate.get(String(row.date ?? '')) ?? 0) + numberValue(row.spend))
    return [...byDate.entries()].filter(([date]) => Boolean(date)).map(([date, value]) => ({ date, value })).sort((left, right) => String(left.date).localeCompare(String(right.date)))
  }
  return []
}

function genericTables(key: string, data: DashboardRecord): Array<{ title: string; columns: DashboardColumn[]; rows: DashboardRecord[]; emptyMessage?: string }> {
  if (key === 'google') {
    const accounts = asRows(data.accounts)
    const campaigns = accounts.flatMap((account) => asRows(account.campaigns).map((row) => ({ ...row, account_name: accountName(account) })))
    const groups = accounts.flatMap((account) => asRows(account.ad_groups).map((row) => ({ ...row, account_name: accountName(account) })))
    const ads = accounts.flatMap((account) => asRows(account.ads).map((row) => ({ ...row, account_name: accountName(account) })))
    const conversions = accounts.flatMap((account) => asRows(account.conversion_actions).map((row) => ({ ...row, account_name: accountName(account) })))
    return [
      { title: 'Campañas', columns: [{ key: 'account_name', label: 'Cuenta' }, { key: 'name', label: 'Campaña' }, { key: 'channel_label', label: 'Tipo' }, { key: 'status', label: 'Estado' }, { key: 'spend', label: 'Costo', format: 'money' }, { key: 'impressions', label: 'Impresiones', format: 'number' }, { key: 'clicks', label: 'Clics', format: 'number' }, { key: 'leads', label: 'Conversiones', format: 'number' }, { key: 'cpl', label: 'Costo/conv.', format: 'money' }], rows: campaigns },
      { title: 'Grupos de anuncios', columns: [{ key: 'account_name', label: 'Cuenta' }, { key: 'campaign_name', label: 'Campaña' }, { key: 'name', label: 'Grupo' }, { key: 'type', label: 'Tipo' }, { key: 'status', label: 'Estado' }, { key: 'spend', label: 'Costo', format: 'money' }, { key: 'impressions', label: 'Impresiones', format: 'number' }, { key: 'clicks', label: 'Clics', format: 'number' }, { key: 'conversions', label: 'Conversiones', format: 'number' }], rows: groups },
      { title: 'Anuncios', columns: [{ key: 'account_name', label: 'Cuenta' }, { key: 'campaign_name', label: 'Campaña' }, { key: 'ad_group_name', label: 'Grupo' }, { key: 'name', label: 'Anuncio' }, { key: 'status', label: 'Estado' }, { key: 'spend', label: 'Costo', format: 'money' }, { key: 'impressions', label: 'Impresiones', format: 'number' }, { key: 'clicks', label: 'Clics', format: 'number' }, { key: 'conversions', label: 'Conversiones', format: 'number' }], rows: ads },
      { title: 'Acciones de conversión', columns: [{ key: 'account_name', label: 'Cuenta' }, { key: 'name', label: 'Acción' }, { key: 'conversions', label: 'Conversiones', format: 'number' }, { key: 'conversion_value', label: 'Valor', format: 'money' }], rows: conversions },
    ]
  }

  if (key === 'analytics') {
    const reports = asRecord(data.reports)
    return [
      { title: 'Adquisición por fuente/campaña', columns: [{ key: 'firstUserDefaultChannelGroup', label: 'Fuente / canal' }, { key: 'sessionCampaignName', label: 'Campaña' }, { key: 'sessions', label: 'Sesiones', format: 'number' }, { key: 'activeUsers', label: 'Usuarios activos', format: 'number' }, { key: 'engagementRate', label: 'Tasa de interacción', format: 'percent' }, { key: 'keyEvents', label: 'Eventos clave', format: 'number' }], rows: asRows(reports.acquisition) },
      { title: 'Páginas de destino', columns: [{ key: 'unifiedPagePathScreen', label: 'Página' }, { key: 'screenPageViews', label: 'Vistas', format: 'number' }, { key: 'activeUsers', label: 'Usuarios activos', format: 'number' }, { key: 'sessions', label: 'Sesiones', format: 'number' }, { key: 'keyEvents', label: 'Eventos clave', format: 'number' }], rows: asRows(reports.pages) },
      { title: 'Eventos clave', columns: [{ key: 'eventName', label: 'Evento' }, { key: 'eventCount', label: 'Eventos', format: 'number' }, { key: 'keyEvents', label: 'Eventos clave', format: 'number' }, { key: 'totalUsers', label: 'Usuarios', format: 'number' }], rows: asRows(reports.events) },
      { title: 'Dispositivo', columns: [{ key: 'deviceCategory', label: 'Dispositivo' }, { key: 'operatingSystem', label: 'Sistema operativo' }, { key: 'activeUsers', label: 'Usuarios activos', format: 'number' }, { key: 'sessions', label: 'Sesiones', format: 'number' }, { key: 'keyEvents', label: 'Eventos clave', format: 'number' }], rows: asRows(reports.devices) },
      { title: 'Región', columns: [{ key: 'country', label: 'País' }, { key: 'city', label: 'Ciudad' }, { key: 'activeUsers', label: 'Usuarios activos', format: 'number' }, { key: 'sessions', label: 'Sesiones', format: 'number' }, { key: 'keyEvents', label: 'Eventos clave', format: 'number' }], rows: asRows(reports.geography) },
    ]
  }

  if (key === 'crm') {
    const acquisition = asRecord(data.acquisition)
    return [
      { title: 'Leads por origen/campaña', columns: [{ key: 'label', label: 'Origen / campaña' }, { key: 'contacts', label: 'Leads', format: 'number' }, { key: 'sales', label: 'Ventas', format: 'number' }], rows: asRows(acquisition.campaignRows) },
      { title: 'Por asesor', columns: [{ key: 'label', label: 'Asesor' }, { key: 'contacts', label: 'Leads asignados', format: 'number' }, { key: 'sales', label: 'Ventas', format: 'number' }], rows: asRows(acquisition.vendorRows) },
      { title: 'Por equipo', columns: [{ key: 'label', label: 'Equipo' }, { key: 'contacts', label: 'Leads', format: 'number' }, { key: 'sales', label: 'Ventas', format: 'number' }], rows: asRows(acquisition.teamRows) },
      { title: 'Por etiqueta', columns: [{ key: 'label', label: 'Etiqueta' }, { key: 'contacts', label: 'Leads', format: 'number' }, { key: 'sales', label: 'Ventas', format: 'number' }], rows: asRows(acquisition.tagRows) },
    ]
  }

  if (key === 'tag_manager') {
    const containers = asRows(data.containers)
    const tags = containers.flatMap((container) => asRows(container.tags).map((row) => ({ ...row, containerName: container.containerName ?? container.name })))
    const triggers = containers.flatMap((container) => asRows(container.triggers).map((row) => ({ ...row, containerName: container.containerName ?? container.name })))
    const variables = containers.flatMap((container) => asRows(container.variables).map((row) => ({ ...row, containerName: container.containerName ?? container.name })))
    return [
      { title: 'Contenedores', columns: [{ key: 'containerName', label: 'Contenedor' }, { key: 'publicId', label: 'ID' }, { key: 'diagnostics.totalTags', label: 'Etiquetas', format: 'number' }, { key: 'diagnostics.totalTriggers', label: 'Activadores', format: 'number' }, { key: 'diagnostics.totalVariables', label: 'Variables', format: 'number' }], rows: containers },
      { title: 'Etiquetas', columns: [{ key: 'containerName', label: 'Contenedor' }, { key: 'name', label: 'Etiqueta' }, { key: 'typeLabel', label: 'Tipo' }, { key: 'paused', label: 'Pausada' }], rows: tags },
      { title: 'Activadores', columns: [{ key: 'containerName', label: 'Contenedor' }, { key: 'name', label: 'Activador' }, { key: 'typeLabel', label: 'Tipo' }, { key: 'tagCount', label: 'Etiquetas', format: 'number' }], rows: triggers },
      { title: 'Variables', columns: [{ key: 'containerName', label: 'Contenedor' }, { key: 'name', label: 'Variable' }, { key: 'typeLabel', label: 'Tipo' }], rows: variables },
    ]
  }

  return []
}

function AlertGroups({ critical, attention }: { critical: Array<{title:string;description:string;account:string}>; attention: Array<{title:string;description:string;account:string}> }) {
  return (
    <section className="mt-5 flex flex-col gap-3">
      <details open className="overflow-hidden rounded-xl border border-[#f1c8c5] bg-white">
        <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-[#a63e38]">Críticas · {critical.length}</summary>
        {critical.length ? <div className="border-t border-[#f7e1df] px-4 py-2">{critical.map((alert,index)=><p key={`${alert.title}-${index}`} className="border-b border-[#f5edec] py-2.5 text-[11px] text-[#494949]"><strong>{alert.title}</strong> · {alert.account} — {alert.description}</p>)}</div> : <p className="border-t border-[#f7e1df] px-4 py-3 text-[11px] text-[#818181]">No hay alertas críticas.</p>}
      </details>
      <details className="overflow-hidden rounded-xl border border-[#eee0b6] bg-white">
        <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-[#9a690b]">Atención · {attention.length}</summary>
        {attention.length ? <div className="border-t border-[#f5edd5] px-4 py-2">{attention.map((alert,index)=><p key={`${alert.title}-${index}`} className="border-b border-[#f5f1e6] py-2.5 text-[11px] text-[#494949]"><strong>{alert.title}</strong> · {alert.account} — {alert.description}</p>)}</div> : <p className="border-t border-[#f5edd5] px-4 py-3 text-[11px] text-[#818181]">No hay alertas de atención.</p>}
      </details>
    </section>
  )
}

function buildBudgetAlerts(budgetRows: Array<{account:string;assigned:number;consumed:number;consumption:number;pace:number;projected:number;suggestedDaily:number;status:string}>, objectiveRows: DashboardRecord[], campaigns: DashboardRecord[]) {
  const critical: Array<{title:string;description:string;account:string}> = []
  const attention: Array<{title:string;description:string;account:string}> = []
  for (const row of budgetRows) {
    if (!row.assigned) continue
    if (row.consumption > 100 || row.projected > row.assigned * 1.1) {
      critical.push({ title: 'Presupuesto', account: row.account, description: `${row.consumption.toFixed(0)}% consumido. Proyección ${moneyFormat(row.projected)}; sugerido por día: ${moneyFormat(row.suggestedDaily)}.` })
    } else if (row.pace > 0 && row.consumption < row.pace * 0.85) {
      attention.push({ title: 'Ritmo de presupuesto', account: row.account, description: `Consumo ${row.consumption.toFixed(0)}%, por debajo del ritmo esperado (${row.pace.toFixed(0)}%).` })
    }
  }
  for (const campaign of campaigns) {
    const results = numberValue(campaign.results ?? campaign.leads ?? campaign.conversions)
    if (results < 5) continue
    const campaignName = normalize(`${campaign.name ?? campaign.campaign_name ?? ''} ${campaign.objective ?? ''}`)
    const account = String(campaign.account_name ?? 'Cuenta')
    const goals = objectiveRows.filter((row) => normalize(field(row, 'Cuenta', 'Account')) === normalize(account))
    const goal = goals.find((row) => {
      const model = normalize(field(row, 'Modelos', 'Modelo'))
      const brand = normalize(field(row, 'Marca'))
      return (!model || model === 'general' || campaignName.includes(model)) && (!brand || campaignName.includes(brand))
    })
    if (!goal) continue
    const cpl = results ? numberValue(campaign.spend) / results : 0
    const baseline = amount(goal, 'CPL Promedio')
    const target = amount(goal, 'OBJETIVO', 'Objetivo')
    if (baseline >= 10 && cpl > baseline) {
      const severity = cpl > baseline * 1.3
      const description = `Costo por resultado ${moneyFormat(cpl)} vs promedio ${moneyFormat(baseline)}${target ? ` (objetivo ${moneyFormat(target)})` : ''}.`
      ;(severity ? critical : attention).push({ title: 'Costo por resultado', account, description })
    }
  }
  return { critical, attention }
}
