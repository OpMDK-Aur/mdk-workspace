'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { DashboardDataTable, type DashboardColumn } from '@/components/conexa/dashboard-data-table'
import type { DashboardBudget, DashboardMetric, DashboardPlatform, DashboardRecord, DashboardRegionRow } from '@/components/conexa/dashboard-types'

const asRecord = (value: unknown): DashboardRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as DashboardRecord : {}
const asRows = (value: unknown): DashboardRecord[] => Array.isArray(value) ? value.filter((row): row is DashboardRecord => Boolean(row && typeof row === 'object' && !Array.isArray(row))) : []
const numberValue = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let text = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!text) return 0
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma > dot) text = text.replace(/\./g, '').replace(',', '.')
  else text = text.replace(/,/g, '')
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : 0
}
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

function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: unknown; money?: boolean; percent?: boolean; decimal?: boolean }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 rounded-xl border border-[#e6e6e3] bg-white px-3 py-3">
          <p className="truncate text-[10px] text-[#858585]">{metric.label}</p>
          <p className="mt-1.5 whitespace-nowrap text-[16px] font-semibold tracking-[-.03em] text-[#202020] tabular-nums">
            {metric.value === 'No disponible' ? metric.value : metric.percent ? `${decimalFormat(metric.value)}%` : metric.money ? moneyFormat(metric.value) : metric.decimal ? decimalFormat(metric.value) : numberFormat(metric.value)}
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
    current.detail += monthlyBudgetRow(row)
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

function currentMonthToken() {
  return monthToken(new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()))
}

function BudgetMonthFilter({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="flex min-w-[140px] flex-1 flex-col gap-1"><span className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#858585]">Mes</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-lg border border-[#e6e6e3] bg-white px-2.5 text-[11px] text-[#333] outline-none focus:border-[#5b5fe8]"><option value="current">Mes actual</option><option value="all">Todos los meses</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
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
    linkClicks: numberValue(campaign.link_clicks), frequency: numberValue(campaign.frequency),
    costPerResult: numberValue(campaign.cost_per_result ?? campaign.cpl),
    ctr: numberValue(campaign.ctr),
    cpm: campaign.impressions ? numberValue(campaign.spend) / numberValue(campaign.impressions) * 1000 : 0,
  }))
}

function sum(rows: DashboardRecord[], key: string) {
  return rows.reduce((total, row) => total + numberValue(row[key]), 0)
}

function monthProgress() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)
  return { elapsed: day, days: new Date(Date.UTC(year, month, 0)).getUTCDate(), remaining: Math.max(0, new Date(Date.UTC(year, month, 0)).getUTCDate() - day) }
}

function isGenericBudgetDimension(value: unknown) {
  const key = normalize(value)
  return !key || key === 'general' || key === 'todas' || key === 'todos' || key === 'sinmodelo'
}

function dimensionMatches(campaignText: string, value: unknown) {
  if (isGenericBudgetDimension(value)) return true
  const alternatives = String(value).split(/[|/]/).map(normalize).filter(Boolean)
  return alternatives.some((part) => campaignText.includes(part))
}

function budgetResultMatches(value: unknown, campaign: DashboardRecord, campaignText: string) {
  if (isGenericBudgetDimension(value)) return true
  const expected = normalize(value)
  const actual = normalize(campaign.result_type ?? campaign.resultType)
  if (expected.includes('whatsapp') || expected.includes('mensaj')) return actual.includes('messaging') || campaignText.includes('whatsapp')
  if (expected.includes('lead') || expected.includes('form') || expected.includes('cliente')) return actual.includes('lead') || campaignText.includes('form')
  return actual.includes(expected) || campaignText.includes(expected)
}

function buildBudgetSegmentRows(rows: DashboardRecord[], campaigns: DashboardRecord[]) {
  const progress = monthProgress()
  return rows.map((row) => {
    const account = String(field(row, 'Cuenta', 'Account') ?? '')
    const brand = field(row, 'Marca')
    const model = field(row, 'Modelos', 'Modelo')
    const modality = field(row, 'Modalidad')
    const objective = field(row, 'Objetivo')
    const resultType = field(row, 'Tipo de resultado')
    const candidates = campaigns.filter((campaign) => {
      if (normalize(campaign.account_name ?? campaign.account) !== normalize(account)) return false
      const campaignText = normalize(`${campaign.name ?? campaign.campaign_name ?? campaign.campaign ?? ''} ${campaign.objective ?? ''} ${campaign.result_type ?? campaign.resultType ?? ''}`)
      return dimensionMatches(campaignText, brand) && dimensionMatches(campaignText, model) && dimensionMatches(campaignText, modality) && dimensionMatches(campaignText, objective) && budgetResultMatches(resultType, campaign, campaignText)
    })
    const budget = monthlyBudgetRow(row)
    const consumed = candidates.reduce((total, campaign) => total + numberValue(campaign.spend), 0)
    const results = candidates.reduce((total, campaign) => total + numberValue(campaign.results ?? campaign.leads ?? campaign.conversions), 0)
    const matched = candidates.length > 0
    const consumption = budget && matched ? consumed / budget * 100 : null
    const projected = progress.elapsed && matched ? consumed / progress.elapsed * progress.days : 0
    const suggestedDaily = progress.remaining > 0 && budget && matched ? Math.max(0, (budget - consumed) / progress.remaining) : null
    const status = !budget ? 'Sin presupuesto asignado' : !matched ? 'Sin coincidencia de campaña' : consumed > budget ? 'Sobre presupuesto' : projected > budget * 1.1 ? 'Proyección > 110%' : (consumption ?? 0) < (progress.elapsed / progress.days) * 85 ? 'Debajo del ritmo' : 'En ritmo'
    return {
      account,
      brand: display(brand),
      objective: display(objective),
      model: display(model),
      modality: display(modality),
      resultType: display(resultType),
      daily: amount(row, 'Presupuesto Diario asignado'),
      monthly: budget,
      percent: percentValue(field(row, '%')),
      general: amount(row, 'Presupuesto General asignado'),
      targetCpl: amount(row, 'Costo por Lead', 'CPL Promedio'),
      maxLeads: amount(row, 'Objetivo Máximo de Leads'),
      leadsByBrand: amount(row, 'Objetivo de Leads x Marca'),
      comments: display(field(row, 'Comentarios')),
      consumed: matched ? consumed : null,
      consumption,
      results: matched ? results : null,
      suggestedDaily,
      status,
    }
  })
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
        { key: 'consumed', label: 'Consumido', format: 'money', right: true }, { key: 'consumption', label: '% consumo', format: 'meter', markerKey: 'pace', right: true },
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
    const selectedMatches = monthFilter === 'all' || monthToken(month) === (monthFilter === 'current' ? currentMonthToken() : monthToken(monthFilter))
    return selectedMatches && accountNames.has(normalize(field(row, 'Cuenta')))
  })
  const tableRows = rowsForMonth.map((row) => {
    const account = String(field(row, 'Cuenta') ?? '')
    const campaign = String(field(row, 'Campaña') ?? '')
    const matchedCampaigns = campaigns.filter((item) => normalize(item.account ?? item.account_name) === normalize(account) && normalize(item.campaign ?? item.name ?? item.campaign_name) === normalize(campaign))
    const actual = matchedCampaigns.reduce((total, item) => total + numberValue(item.spend), 0)
    const budget = amount(row, 'Inversión (ARS)', 'Inversión', 'Presupuesto Mensual asignado')
    const status = !budget ? 'Sin presupuesto' : !matchedCampaigns.length ? 'Sin coincidencia de campaña' : actual > budget ? 'Sobre presupuesto' : 'En seguimiento'
    return { account, campaign, month: display(field(row, 'Mes')), brand: display(field(row, 'Marca')), modality: display(field(row, 'Modalidad')), resultType: display(field(row, 'Tipo de resultado')), budget, actual: matchedCampaigns.length ? actual : null, consumption: budget && matchedCampaigns.length ? actual / budget * 100 : null, status }
  })
  return (
    <DashboardDataTable title="Presupuesto general por campaña" description="Cruce por nombre exacto de cuenta y campaña; el mes del archivo se interpreta en el año actual." searchable columns={[
      { key: 'account', label: 'Cuenta' }, { key: 'campaign', label: 'Campaña' }, { key: 'brand', label: 'Marca' }, { key: 'modality', label: 'Modalidad' },
      { key: 'resultType', label: 'Tipo de resultado' }, { key: 'month', label: 'Mes' }, { key: 'budget', label: 'Presupuesto', format: 'money', right: true },
      { key: 'actual', label: 'Consumido', format: 'money', right: true }, { key: 'consumption', label: '% consumo', format: 'meter', right: true }, { key: 'status', label: 'Estado' },
    ]} rows={tableRows} emptyMessage="No hay líneas de presupuesto general que coincidan con las cuentas activas y el mes seleccionado." />
  )
}

export type MetaDashboardProps = {
  platform: DashboardPlatform
  data: DashboardRecord
  metrics: DashboardMetric[]
  period: string
  budget?: DashboardBudget
  monthData: DashboardRecord
  regionData?: { available?: boolean; rows?: DashboardRegionRow[]; message?: string }
  regionLoading: boolean
}

export function MetaDashboardSection({ platform, data, metrics, period, budget, monthData, regionData, regionLoading }: MetaDashboardProps) {
  const accounts = metaAccounts(data)
  const campaigns: DashboardRecord[] = accounts.flatMap((account) => asRows(account.campaigns).map((campaign): DashboardRecord => ({ ...campaign, account_id: account.account_id, account_name: accountName(account) })))
  const adsets: DashboardRecord[] = accounts.flatMap((account) => asRows(account.adsets).map((adset): DashboardRecord => ({ ...adset, account_id: account.account_id, account_name: accountName(account) })))
  const ads: DashboardRecord[] = accounts.flatMap((account) => asRows(account.ads).map((ad): DashboardRecord => ({ ...ad, account_id: account.account_id, account_name: accountName(account) })))
  const budgetRows = asRows(budget?.sheets?.meta)
  const objectiveRows = asRows(budget?.sheets?.objetivosCpl)
  const generalRows = asRows(budget?.sheets?.general)
  const activeAccountNames = new Set(accounts.map((account) => normalize(accountName(account))))
  const activeMetaBudgetRows = budgetRows.filter((row) => activeAccountNames.has(normalize(field(row, 'Cuenta', 'Account'))))
  const activeMetaObjectiveRows = objectiveRows.filter((row) => activeAccountNames.has(normalize(field(row, 'Cuenta', 'Account'))))
  const [accountFilter, setAccountFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('')
  const [objectiveFilter, setObjectiveFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [modalityFilter, setModalityFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('current')
  const [dailyMetric, setDailyMetric] = useState<'spend' | 'results'>('spend')

  const uniqueBudgetValues = (column: string) => [...new Set(activeMetaBudgetRows.map((row) => display(field(row, column))).filter((value) => value !== '—' && value.trim()))].sort((left, right) => left.localeCompare(right, 'es'))
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
    frequency: sum(filteredCampaigns, 'reach') ? sum(filteredCampaigns, 'impressions') / sum(filteredCampaigns, 'reach') : 0,
    clicks: sum(filteredCampaigns, 'clicks'),
    linkClicks: sum(filteredCampaigns, 'link_clicks'),
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
    { label: 'Clics en enlace', value: totals.linkClicks },
    { label: 'Impresiones', value: totals.impressions },
    { label: 'Alcance', value: totals.reach },
    { label: 'Frecuencia', value: totals.frequency, decimal: true },
    { label: 'CTR', value: totals.impressions ? totals.clicks / totals.impressions * 100 : 0, percent: true },
    { label: 'CPC', value: totals.clicks ? totals.spend / totals.clicks : 0, money: true },
    { label: 'CPM', value: totals.impressions ? totals.spend / totals.impressions * 1000 : 0, money: true },
  ]

  const dailyAccounts = accounts.filter((account) => accountFilter === 'all' || normalize(accountName(account)) === normalize(accountFilter))
  const dailySeries = dailyAccounts.map((account, index) => ({ key: `account${index}`, label: accountName(account), color: `var(--chart-${index % 5 + 1})` }))
  const resultTypeMap = new Map<string, { type: string; results: number; spend: number }>()
  for (const campaign of filteredCampaigns) {
    const type = String(campaign.source_action_type ?? campaign.result_type ?? 'Sin clasificar')
    const current = resultTypeMap.get(type) ?? { type, results: 0, spend: 0 }
    current.results += numberValue(campaign.results ?? campaign.leads ?? campaign.conversions)
    current.spend += numberValue(campaign.spend)
    resultTypeMap.set(type, current)
  }
  const resultTypeRows = [...resultTypeMap.values()].map((item) => ({ ...item, cost: item.results ? item.spend / item.results : 0 })).sort((left, right) => right.results - left.results)

  const dailyMap = new Map<string, DashboardRecord>()
  dailyAccounts.forEach((account, index) => {
    for (const point of asRows(account.daily)) {
      const date = String(point.date ?? '')
      if (!date) continue
      const current = dailyMap.get(date) ?? { date }
      current[dailySeries[index].key] = numberValue(point[dailyMetric])
      dailyMap.set(date, current)
    }
  })
  const dailyRows = [...dailyMap.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)))
  const dailyChartConfig = Object.fromEntries(dailySeries.map((series) => [series.key, { label: series.label, color: series.color }])) as ChartConfig
  const regionRows = (regionData?.rows ?? []).filter((row) => accountFilter === 'all' || (row.account_names ?? []).some((name) => normalize(name) === normalize(accountFilter))).slice(0, 8)
  const regionConfig = { leads: { label: 'Leads formulario', color: 'var(--chart-1)' } } satisfies ChartConfig
  const monthMetaAccounts = metaAccounts(asRecord(monthData.meta))
  const monthMetaCampaigns: DashboardRecord[] = monthMetaAccounts.flatMap((account) => asRows(account.campaigns).map((campaign): DashboardRecord => ({ ...campaign, account_id: account.account_id, account_name: accountName(account) })))
  const monthMetaCampaignRows = makeMetaCampaignRows(monthMetaCampaigns, monthMetaAccounts)
  const budgetSummary = calculateAccountBudgets(accounts, monthMetaAccounts, budgetRows)
  const accountBudgetRows = activeMetaBudgetRows.filter((row) => accountFilter === 'all' || normalize(field(row, 'Cuenta')) === normalize(accountFilter))
    .filter((row) => brandFilter === 'all' || normalize(field(row, 'Marca')) === normalize(brandFilter))
    .filter((row) => modelFilter === 'all' || normalize(field(row, 'Modelos')) === normalize(modelFilter))
    .filter((row) => modalityFilter === 'all' || normalize(field(row, 'Modalidad')) === normalize(modalityFilter))
  const metaBudgetDetailRows = buildBudgetSegmentRows(accountBudgetRows, monthMetaCampaignRows)
  const objectiveDetailRows = activeMetaObjectiveRows.filter((row) => accountFilter === 'all' || normalize(field(row, 'Cuenta')) === normalize(accountFilter)).map((row) => ({
    account: display(field(row, 'Cuenta')), brand: display(field(row, 'Marca')), model: display(field(row, 'Modelos')),
    cplAverage: amount(row, 'CPL Promedio'), target: amount(row, 'OBJETIVO', 'Objetivo'),
  }))
  const alertItems = buildBudgetAlerts(budgetSummary, activeMetaObjectiveRows, monthMetaCampaignRows)
  const visibleCriticalAlerts = alertItems.critical.filter((item) => accountFilter === 'all' || normalize(item.account) === normalize(accountFilter))
  const visibleAttentionAlerts = alertItems.attention.filter((item) => accountFilter === 'all' || normalize(item.account) === normalize(accountFilter))
  const metaColumns: DashboardColumn[] = [
    { key: 'account', label: 'Cuenta' }, { key: 'campaign', label: 'Campaña' }, { key: 'objective', label: 'Objetivo' },
    { key: 'status', label: 'Estado' }, { key: 'spend', label: 'Inversión', format: 'money', right: true },
    { key: 'impressions', label: 'Impresiones', format: 'number', right: true }, { key: 'reach', label: 'Alcance', format: 'number', right: true },
    { key: 'frequency', label: 'Frecuencia', format: 'number', right: true }, { key: 'clicks', label: 'Clics', format: 'number', right: true },
    { key: 'linkClicks', label: 'Clics en enlace', format: 'number', right: true }, { key: 'results', label: 'Resultados', format: 'number', right: true }, { key: 'costPerResult', label: 'Costo x resultado', format: 'money', right: true },
    { key: 'ctr', label: 'CTR', format: 'percent', right: true }, { key: 'cpm', label: 'CPM', format: 'money', right: true },
  ]
  const hasMetaData = accounts.some((account) => numberValue(account.api_rows_received) > 0 || asRows(account.campaigns).length > 0)
  const visibleAccounts = accountFilter === 'all' ? accounts : accounts.filter((account) => normalize(accountName(account)) === normalize(accountFilter))
  const visibleBudgetSummary = accountFilter === 'all' ? budgetSummary : budgetSummary.filter((row) => normalize(row.account) === normalize(accountFilter))
  const campaignRows = makeMetaCampaignRows(filteredCampaigns, accounts)
  const adsetRows = adsets.filter((row) => (accountFilter === 'all' || normalize(row.account_name) === normalize(accountFilter)) && (!campaignFilter || normalize(row.campaign_name).includes(normalize(campaignFilter)))).map((row) => ({
    account: row.account_name, campaign: row.campaign_name, adset: row.name, status: row.status ?? row.effective_status ?? '—',
    spend: numberValue(row.spend), impressions: numberValue(row.impressions), reach: numberValue(row.reach), frequency: numberValue(row.frequency), clicks: numberValue(row.clicks), linkClicks: numberValue(row.link_clicks), results: numberValue(row.results ?? row.leads ?? row.conversions),
    costPerResult: numberValue(row.cost_per_result ?? row.cpl), ctr: numberValue(row.ctr), cpm: row.impressions ? numberValue(row.spend) / numberValue(row.impressions) * 1000 : 0, resultType: channelLabel(row.result_type),
  }))
  const adRows = ads.filter((row) => (accountFilter === 'all' || normalize(row.account_name) === normalize(accountFilter)) && (!campaignFilter || normalize(`${row.campaign_name ?? ''} ${row.adset_name ?? ''} ${row.name ?? ''}`).includes(normalize(campaignFilter)))).map((row) => ({
    account: row.account_name, campaign: row.campaign_name, adset: row.adset_name, ad: row.name, status: row.status ?? row.effective_status ?? '—',
    spend: numberValue(row.spend), impressions: numberValue(row.impressions), reach: numberValue(row.reach), frequency: numberValue(row.frequency), clicks: numberValue(row.clicks), linkClicks: numberValue(row.link_clicks), results: numberValue(row.results ?? row.leads ?? row.conversions),
    costPerResult: numberValue(row.cost_per_result ?? row.cpl), ctr: numberValue(row.ctr), cpm: row.impressions ? numberValue(row.spend) / numberValue(row.impressions) * 1000 : 0, previewUrl: row.preview_url ?? row.preview_shareable_link ?? '',
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
        {months.length > 0 && <BudgetMonthFilter value={monthFilter} options={months} onChange={setMonthFilter} />}
        <button type="button" onClick={() => { setAccountFilter('all'); setCampaignFilter(''); setObjectiveFilter('all'); setChannelFilter('all'); setStatusFilter('all'); setBrandFilter('all'); setModelFilter('all'); setModalityFilter('all'); setMonthFilter('current') }} className="h-9 rounded-lg px-3 text-[11px] font-medium text-[#6a6a6a] underline underline-offset-2">Limpiar filtros</button>
      </div>

      {hasMetaData ? <MetricGrid metrics={kpis} /> : <EmptyPanel text="Sin datos disponibles para este cliente y período en Meta Ads." />}
      {hasMetaData && <div className="mt-4"><DashboardDataTable title="Resultados por tipo" columns={[{ key: 'type', label: 'Tipo de resultado' }, { key: 'results', label: 'Resultados', format: 'number', right: true }, { key: 'spend', label: 'Inversión', format: 'money', right: true }, { key: 'cost', label: 'Costo por resultado', format: 'money', right: true }]} rows={resultTypeRows} emptyMessage="No se recibieron tipos de resultado para este período." /></div>}

      <div className="mt-5 rounded-xl border border-[#e6e6e3] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><SectionHeading title="Evolución diaria por cuenta" detail={period} /><p className="text-[10px] text-[#878787]">Los datos se agrupan por cuenta publicitaria; el selector de cuenta filtra la serie.</p></div>
          <select value={dailyMetric} onChange={(event) => setDailyMetric(event.target.value as 'spend' | 'results')} aria-label="Métrica de evolución diaria" className="h-8 rounded-lg border border-[#e6e6e3] bg-white px-2.5 text-[11px]">
            <option value="spend">Inversión</option><option value="results">Resultados</option>
          </select>
        </div>
        {dailyRows.length ? (
          <ChartContainer config={dailyChartConfig} className="h-[240px] w-full">
            <LineChart accessibilityLayer data={dailyRows} margin={{ left: 8, right: 10, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value: string) => value.slice(5)} />
              <YAxis tickLine={false} axisLine={false} width={54} tickFormatter={(value: number) => numberFormat(value)} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => String(label)} />} />
              <ChartLegend content={<ChartLegendContent />} />
              {dailySeries.map((series) => <Line key={series.key} name={series.label} type="monotone" dataKey={series.key} stroke={`var(--color-${series.key})`} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ChartContainer>
        ) : <EmptyPanel text="No hay evolución diaria disponible en las herramientas de Meta para este período." />}
      </div>

      <BudgetByAccount platformName="Meta Ads" rows={visibleBudgetSummary} />
      <DashboardDataTable title="Asignación Meta por marca/modelo" description="Valores y dimensiones leídos dinámicamente de la hoja META." columns={[
        { key: 'account', label: 'Cuenta' }, { key: 'brand', label: 'Marca' }, { key: 'objective', label: 'Objetivo' }, { key: 'model', label: 'Modelo' },
        { key: 'modality', label: 'Modalidad' }, { key: 'resultType', label: 'Tipo de resultado' }, { key: 'daily', label: 'Diario', format: 'money', right: true },
        { key: 'monthly', label: 'Mensual asignado', format: 'money', right: true }, { key: 'consumed', label: 'Consumido', format: 'money', right: true },
        { key: 'consumption', label: '% consumo', format: 'meter', markerKey: 'pace', right: true }, { key: 'pace', label: 'Ritmo esperado', format: 'percent', right: true },
        { key: 'suggestedDaily', label: 'Diario sugerido', format: 'money', right: true }, { key: 'general', label: 'Presupuesto general', format: 'money', right: true },
        { key: 'status', label: 'Estado' }, { key: 'comments', label: 'Comentarios' },
      ]} rows={metaBudgetDetailRows} emptyMessage="El archivo no tiene filas META para estas cuentas." />
      <GeneralCampaignBudget rows={generalRows} monthFilter={monthFilter} campaigns={monthMetaCampaignRows} accounts={visibleAccounts} />
      <DashboardDataTable title="Objetivos CPL" description="Referencia de costo por lead cargada en la hoja Objetivos CPL." columns={[
        { key: 'account', label: 'Cuenta' }, { key: 'brand', label: 'Marca' }, { key: 'model', label: 'Modelo' },
        { key: 'cplAverage', label: 'CPL promedio', format: 'money', right: true }, { key: 'target', label: 'Objetivo', format: 'money', right: true },
      ]} rows={objectiveDetailRows} emptyMessage="El archivo no incluye objetivos CPL para estas cuentas." />

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
                <Bar dataKey="leads" fill="var(--color-leads)" radius={4} />
              </BarChart>
            </ChartContainer>
            <DashboardDataTable title="Detalle por provincia" columns={[
              { key: 'region', label: 'Provincia' }, { key: 'leads', label: 'Leads', format: 'number', right: true },
              { key: 'percent_of_leads', label: '% de leads', format: 'percent', right: true }, { key: 'spend', label: 'Inversión', format: 'money', right: true },
              { key: 'cost_per_lead', label: 'Costo por lead', format: 'money', right: true }, { key: 'impressions', label: 'Impresiones', format: 'number', right: true },
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
          { key: 'reach', label: 'Alcance', format: 'number', right: true }, { key: 'frequency', label: 'Frecuencia', format: 'number', right: true }, { key: 'cpm', label: 'CPM', format: 'money', right: true },
          { key: 'clicks', label: 'Clics', format: 'number', right: true }, { key: 'linkClicks', label: 'Clics en enlace', format: 'number', right: true }, { key: 'ctr', label: 'CTR', format: 'percent', right: true },
          { key: 'results', label: 'Resultados', format: 'number', right: true }, { key: 'costPerResult', label: 'Costo x resultado', format: 'money', right: true }, { key: 'resultType', label: 'Tipo de resultado' },
        ]} rows={adsetRows} emptyMessage="Sin conjuntos de anuncios con datos para el período seleccionado." />
        <DashboardDataTable title="Anuncios" columns={[
          { key: 'account', label: 'Cuenta' }, { key: 'campaign', label: 'Campaña' }, { key: 'adset', label: 'Conjunto' }, { key: 'ad', label: 'Anuncio' },
          { key: 'spend', label: 'Inversión', format: 'money', right: true }, { key: 'impressions', label: 'Impresiones', format: 'number', right: true },
          { key: 'reach', label: 'Alcance', format: 'number', right: true }, { key: 'frequency', label: 'Frecuencia', format: 'number', right: true }, { key: 'cpm', label: 'CPM', format: 'money', right: true },
          { key: 'clicks', label: 'Clics', format: 'number', right: true }, { key: 'linkClicks', label: 'Clics en enlace', format: 'number', right: true }, { key: 'ctr', label: 'CTR', format: 'percent', right: true },
          { key: 'results', label: 'Resultados', format: 'number', right: true }, { key: 'costPerResult', label: 'Costo x resultado', format: 'money', right: true }, { key: 'previewUrl', label: 'Vista previa', link: true },
        ]} rows={adRows} emptyMessage="Sin anuncios con datos para el período seleccionado." />
      </div>

      <AlertGroups critical={visibleCriticalAlerts} attention={visibleAttentionAlerts} />
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
  const googleBudgetRows = asRows(budget?.sheets?.google)
  const googleBudgetSummary = calculateAccountBudgets(googleAccountList, monthlyGoogleAccounts, googleBudgetRows)
  const googleAccountNames = new Set(googleAccountList.map((account) => normalize(accountName(account))))
  const activeGoogleBudgetRows = googleBudgetRows.filter((row) => googleAccountNames.has(normalize(field(row, 'Cuenta', 'Account'))))
  const monthlyGoogleCampaigns = monthlyGoogleAccounts.flatMap((account) => asRows(account.campaigns).map((campaign) => ({ ...campaign, account_name: accountName(account) })))
  const googleBudgetDetails = buildBudgetSegmentRows(activeGoogleBudgetRows, monthlyGoogleCampaigns)
  const googleRawObjectives = asRows(budget?.sheets?.objetivosCpl).filter((row) => googleAccountNames.has(normalize(field(row, 'Cuenta', 'Account'))))
  const googleObjectiveRows = googleRawObjectives.map((row) => ({ account: display(field(row, 'Cuenta')), brand: display(field(row, 'Marca')), model: display(field(row, 'Modelos')), cplAverage: amount(row, 'CPL Promedio'), target: amount(row, 'OBJETIVO', 'Objetivo') }))
  const googleAlertItems = buildBudgetAlerts(googleBudgetSummary, googleRawObjectives, monthlyGoogleCampaigns)
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
            <DashboardDataTable title="Asignación Google por cuenta/modelo" columns={[
              { key: 'account', label: 'Cuenta' }, { key: 'brand', label: 'Marca' }, { key: 'model', label: 'Modelo' }, { key: 'modality', label: 'Modalidad' },
              { key: 'resultType', label: 'Tipo de resultado' }, { key: 'daily', label: 'Diario', format: 'money', right: true },
              { key: 'monthly', label: 'Mensual asignado', format: 'money', right: true }, { key: 'consumed', label: 'Consumido', format: 'money', right: true },
              { key: 'consumption', label: '% consumo', format: 'meter', markerKey: 'pace', right: true }, { key: 'pace', label: 'Ritmo esperado', format: 'percent', right: true },
              { key: 'general', label: 'Presupuesto general', format: 'money', right: true }, { key: 'targetCpl', label: 'Costo por lead objetivo', format: 'money', right: true },
              { key: 'maxLeads', label: 'Objetivo máximo leads', format: 'number', right: true }, { key: 'leadsByBrand', label: 'Objetivo leads por marca', format: 'number', right: true },
              { key: 'status', label: 'Estado' },
            ]} rows={googleBudgetDetails} emptyMessage="El archivo no tiene filas GOOGLE para estas cuentas." />
            <DashboardDataTable title="Objetivos CPL" columns={[{ key: 'account', label: 'Cuenta' }, { key: 'brand', label: 'Marca' }, { key: 'model', label: 'Modelo' }, { key: 'cplAverage', label: 'CPL promedio', format: 'money', right: true }, { key: 'target', label: 'Objetivo', format: 'money', right: true }]} rows={googleObjectiveRows} emptyMessage="El archivo no incluye objetivos CPL para estas cuentas." />
            <AlertGroups critical={googleAlertItems.critical} attention={googleAlertItems.attention} />
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
  const options = platformKey === 'analytics'
    ? [{ key: 'sessions', label: 'Sesiones' }, { key: 'activeUsers', label: 'Usuarios activos' }, { key: 'keyEvents', label: 'Eventos clave' }]
    : [{ key: 'spend', label: 'Inversión' }, { key: 'clicks', label: 'Clics' }, { key: 'conversions', label: 'Conversiones' }]
  const [metric, setMetric] = useState(options[0].key)
  const option = options.find((item) => item.key === metric) ?? options[0]
  const config = { [option.key]: { label: option.label, color: 'var(--chart-1)' } } satisfies ChartConfig
  return (
    <div className="mt-4 rounded-xl border border-[#e6e6e3] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><SectionHeading title="Evolución diaria" detail={period} /><label className="flex items-center gap-2 text-[10px] text-[#777]">Métrica<select value={metric} onChange={(event) => setMetric(event.target.value)} className="h-8 rounded-lg border border-[#e6e6e3] bg-white px-2 text-[11px]">{options.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
      <ChartContainer config={config} className="h-[220px] w-full">
        <LineChart accessibilityLayer data={rows} margin={{ left: 8, right: 10, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value: string) => String(value).slice(5)} />
          <YAxis tickLine={false} axisLine={false} width={54} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => String(label)} />} />
          <Line type="monotone" dataKey={option.key} name={option.label} stroke={`var(--color-${option.key})`} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    </div>
  )
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
  if (key === 'google') return accounts.length > 0
  return accounts.some((account) => numberValue(account.api_rows_received) > 0 || asRows(account.campaigns).length > 0) || metrics.some((metric) => numberValue(metric.value) > 0)
}

function genericDaily(key: string, data: DashboardRecord) {
  if (key === 'analytics') {
    const reports = asRecord(data.reports)
    return asRows(reports.byDay).map((row) => ({ date: row.date, sessions: numberValue(row.sessions), activeUsers: numberValue(row.activeUsers), keyEvents: numberValue(row.keyEvents) }))
  }
  if (key === 'google') {
    const byDate = new Map<string, { date: string; spend: number; clicks: number; conversions: number }>()
    for (const account of asRows(data.accounts)) for (const row of asRows(account.daily)) {
      const date = String(row.date ?? '')
      if (!date) continue
      const current = byDate.get(date) ?? { date, spend: 0, clicks: 0, conversions: 0 }
      current.spend += numberValue(row.spend)
      current.clicks += numberValue(row.clicks)
      current.conversions += numberValue(row.conversions)
      byDate.set(date, current)
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
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
      { title: 'Palabras clave y términos de búsqueda', columns: [{ key: 'keyword', label: 'Palabra clave' }, { key: 'campaign_name', label: 'Campaña' }, { key: 'clicks', label: 'Clics', format: 'number' }, { key: 'conversions', label: 'Conversiones', format: 'number' }], rows: [], emptyMessage: 'La herramienta actual de Google Ads no devuelve palabras clave ni términos de búsqueda.' },
      { title: 'Ubicación geográfica', columns: [{ key: 'location', label: 'Ubicación' }, { key: 'impressions', label: 'Impresiones', format: 'number' }, { key: 'clicks', label: 'Clics', format: 'number' }, { key: 'conversions', label: 'Conversiones', format: 'number' }], rows: [], emptyMessage: 'La herramienta actual de Google Ads no devuelve el desglose geográfico.' },
      { title: 'Dispositivo', columns: [{ key: 'device', label: 'Dispositivo' }, { key: 'impressions', label: 'Impresiones', format: 'number' }, { key: 'clicks', label: 'Clics', format: 'number' }, { key: 'conversions', label: 'Conversiones', format: 'number' }], rows: [], emptyMessage: 'La herramienta actual de Google Ads no devuelve el desglose por dispositivo.' },
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
    const opportunityReport = asRecord(data.opportunities)
    const stageMap = new Map<string, { stage: string; pipeline: string; opportunities: number; value: number }>()
    for (const opportunity of asRows(opportunityReport.opportunities)) {
      const stage = asRecord(opportunity.stage)
      const pipeline = display(opportunity.pipeline_name ?? opportunity.pipeline_id)
      const stageName = display(stage.name ?? opportunity.stage_name ?? opportunity.status)
      const key = `${pipeline}|${stageName}`
      const current = stageMap.get(key) ?? { stage: stageName, pipeline, opportunities: 0, value: 0 }
      current.opportunities += 1
      current.value += numberValue(opportunity.amount)
      stageMap.set(key, current)
    }
    return [
      { title: 'Leads por origen/campaña', columns: [{ key: 'label', label: 'Origen / campaña' }, { key: 'contacts', label: 'Leads', format: 'number' }, { key: 'sales', label: 'Ventas', format: 'number' }], rows: asRows(acquisition.campaignRows) },
      { title: 'Oportunidades por etapa', columns: [{ key: 'pipeline', label: 'Pipeline' }, { key: 'stage', label: 'Etapa' }, { key: 'opportunities', label: 'Oportunidades', format: 'number' }, { key: 'value', label: 'Valor', format: 'money' }], rows: [...stageMap.values()] },
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
    const campaignLabel = String(campaign.name ?? campaign.campaign_name ?? campaign.campaign ?? 'Campaña')
    const campaignName = normalize(`${campaignLabel} ${campaign.objective ?? ''}`)
    const account = String(campaign.account_name ?? campaign.account ?? 'Cuenta')
    const goals = objectiveRows.filter((row) => normalize(field(row, 'Cuenta', 'Account')) === normalize(account))
    const goal = goals.find((row) => {
      const model = normalize(field(row, 'Modelos', 'Modelo'))
      const brand = normalize(field(row, 'Marca'))
      return (!model || model === 'general' || campaignName.includes(model)) && (!brand || campaignName.includes(brand))
    })
    if (!goal) continue
    const cpl = numberValue(campaign.cost_per_result ?? campaign.costPerResult) || (results ? numberValue(campaign.spend) / results : 0)
    const baseline = amount(goal, 'CPL Promedio')
    const target = amount(goal, 'OBJETIVO', 'Objetivo')
    const aboveBaseline = baseline > 0 && cpl > baseline
    const aboveTarget = target > 0 && cpl > target
    if (!aboveBaseline && !aboveTarget) continue
    const severity = baseline > 0 && cpl > baseline * 1.3
    const alternative = campaigns
      .filter((item) => normalize(item.account_name ?? item.account) === normalize(account) && normalize(item.name ?? item.campaign_name ?? item.campaign) !== normalize(campaignLabel) && numberValue(item.results ?? item.leads ?? item.conversions) >= 5)
      .map((item) => ({ name: String(item.name ?? item.campaign_name ?? item.campaign ?? 'Campaña'), cpl: numberValue(item.cost_per_result ?? item.costPerResult) || numberValue(item.spend) / Math.max(1, numberValue(item.results ?? item.leads ?? item.conversions)) }))
      .filter((item) => item.cpl > 0 && item.cpl < cpl)
      .sort((left, right) => left.cpl - right.cpl)[0]
    const recommendation = alternative ? ` Considerar ${alternative.name} (${moneyFormat(alternative.cpl)}).` : ''
    const comparison = baseline ? `vs promedio ${moneyFormat(baseline)}` : `sobre objetivo ${moneyFormat(target)}`
    const description = `${campaignLabel}: CPL ${moneyFormat(cpl)} ${comparison}${target ? ` (objetivo ${moneyFormat(target)})` : ''}.${recommendation}`
    ;(severity ? critical : attention).push({ title: 'Costo por resultado', account, description })
  }
  return { critical, attention }
}
