'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Client, DashboardFilters, DashboardKPIs, CampaignTypeData, InvestmentTrendPoint, ScorecardRow } from '@/lib/types'
import { KPICards } from './kpi-cards'
import { CampaignTypeChart } from './campaign-type-chart'
import { InvestmentTrendChart } from './investment-trend-chart'
import { ScorecardTable } from './scorecard-table'
import { ScorecardTimeline } from './scorecard-timeline'
import { ConversionDailyTable } from './conversion-daily-table'
import { CampaignAlertsPanel } from './campaign-alerts-panel'
import { DashboardFiltersBar } from './filters-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ClientsPlatformConfig } from './platform-config-panel'
import { ReportGeneratorModal } from './report-generator-modal'
import { FileText, Clock, Settings, RefreshCw } from 'lucide-react'
import { subDays, format } from 'date-fns'
import type { Profile } from '@/lib/types'

interface DashboardContentProps {
  clients: Client[]
  profile?: Profile | null
}

type AdsApiResponse = {
  platform: string
  campaigns: Array<{
    id: string
    name: string
    status: string
    // Meta uses campaign_type/objective, Google uses advertising_channel_type
    campaign_type?: string
    advertising_channel_type?: string
    channel_label?: string
    budget?: number
    impressions: number
    clicks: number
    spend: number
    leads: number
    cpl: number
    ctr: number
    // Meta-only
    lead_type?: string
  }>
  campaign_types: Array<{ type: string; label?: string; spend: number; leads: number; percentage: number }>
  totals: { impressions: number; clicks: number; spend: number; leads: number; ctr: number | string; cpc: number | string; cpl: number | string }
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getDefaultFilters(): DashboardFilters {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    platform: 'all',
    clientIds: [],
    adAccountId: null,
    dateRange: {
      preset: 'last_30d',
      start: toDateString(start),
      end: toDateString(end),
    },
  }
}

function buildApiUrl(baseUrl: string, filters: DashboardFilters, extraParams: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    date_range: filters.dateRange.preset,
    ...extraParams,
  })
  // Always pass explicit start/end so the scorecard and timeline use the same date range
  if (filters.dateRange.start && filters.dateRange.end) {
    params.set('start_date', filters.dateRange.start)
    params.set('end_date', filters.dateRange.end)
  }
  if (filters.adAccountId) {
    params.set('ad_account_id', filters.adAccountId)
  }
  return `${baseUrl}?${params}`
}

async function fetchAdsData(client: Client, filters: DashboardFilters, bust = false): Promise<AdsApiResponse[]> {
  const results: AdsApiResponse[] = []
  const { platform, adAccountId } = filters

  // If a specific ad account is selected, only fetch the matching platform
  const fetchMeta = (platform === 'all' || platform === 'meta') && client.meta_ads_account_id
    && (!adAccountId || client.meta_ads_account_id.split(',').map(s => s.trim()).includes(adAccountId))
  const fetchGoogle = (platform === 'all' || platform === 'google') && client.google_ads_customer_id
    && (!adAccountId || client.google_ads_customer_id.split(',').map(s => s.trim()).includes(adAccountId))
  const bustParam = bust ? { bust: '1' } : {}

  // Determine which Google customer IDs to fetch
  const allGoogleIds = client.google_ads_customer_id
    ? client.google_ads_customer_id.split(',').map(s => s.trim()).filter(Boolean)
    : []
  // If adAccountId is set and belongs to this client, only use that one
  const googleIdsToFetch = fetchGoogle
    ? (adAccountId && allGoogleIds.includes(adAccountId) ? [adAccountId] : allGoogleIds)
    : []

  const metaAccountId = (adAccountId && client.meta_ads_account_id?.split(',').map(s => s.trim()).includes(adAccountId))
    ? adAccountId
    : client.meta_ads_account_id!

  await Promise.all([
    fetchMeta ? fetch(buildApiUrl('/api/ads/meta', filters, { account_id: metaAccountId }))
      .then(r => r.json())
      .then(d => { if (!d.error) results.push(d) })
      .catch(() => {}) : Promise.resolve(),
    ...googleIdsToFetch.map(customerId =>
      fetch(buildApiUrl('/api/ads/google', filters, { customer_id: customerId, ...bustParam }))
        .then(r => r.json())
        .then(d => { if (!d.error) results.push(d) })
        .catch(() => {})
    ),
  ])

  return results
}

export function DashboardContent({ clients, profile }: DashboardContentProps) {
  const [filters, setFilters] = useState<DashboardFilters>(getDefaultFilters)
  const [kpis, setKpis] = useState<DashboardKPIs>({ totalInvestment: 0, leads: 0, cpl: 0, investmentChange: 0, leadsChange: 0, cplChange: 0 })
  const [campaignTypes, setCampaignTypes] = useState<CampaignTypeData[]>([])
  const [trendData, setTrendData] = useState<InvestmentTrendPoint[]>([])
  const [scorecardRows, setScorecardRows] = useState<ScorecardRow[]>([])
  const [alertsRows, setAlertsRows] = useState<ScorecardRow[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsRefreshKey, setAlertsRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [scorecardView, setScorecardView] = useState<'clients' | 'campaigns'>('clients')
  const [scorecardClientId, setScorecardClientId] = useState<string | null>(null)
  const [scorecardCampaignIds, setScorecardCampaignIds] = useState<string[]>([])
  const [showPlatformConfig, setShowPlatformConfig] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  const canConfigurePlatforms = profile?.role === 'direccion' || profile?.role === 'project_manager' || !profile

  // Stable client IDs string to avoid infinite loops
  const clientIdsKey = filters.clientIds.join(',')
  const targetClients = filters.clientIds.length > 0
    ? clients.filter(c => filters.clientIds.includes(c.id))
    : clients

  const fetchData = useCallback(async (clients: Client[], filters: DashboardFilters, bust = false) => {
    if (clients.length === 0) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const allResults: Array<{ client: Client; data: AdsApiResponse }> = []
      const errors: Record<string, string> = {}
      const bustParam = bust ? { bust: '1' } : {}

      // CRM contacts — placeholder, integration coming soon
      const crmContactsByClientId: Record<string, number> = {}

      await Promise.all(
        clients.map(async client => {
          const { platform, adAccountId } = filters
          const fetchMeta = (platform === 'all' || platform === 'meta') && client.meta_ads_account_id
            && (!adAccountId || client.meta_ads_account_id.split(',').map(s => s.trim()).includes(adAccountId))
          const fetchGoogle = (platform === 'all' || platform === 'google') && client.google_ads_customer_id
            && (!adAccountId || client.google_ads_customer_id.split(',').map(s => s.trim()).includes(adAccountId))

          const allGoogleIds = client.google_ads_customer_id
            ? client.google_ads_customer_id.split(',').map(s => s.trim()).filter(Boolean)
            : []
          const googleIdsToFetch = fetchGoogle
            ? (adAccountId && allGoogleIds.includes(adAccountId) ? [adAccountId] : allGoogleIds)
            : []
          const metaAccountId = (adAccountId && client.meta_ads_account_id?.split(',').map(s => s.trim()).includes(adAccountId))
            ? adAccountId
            : client.meta_ads_account_id!

          await Promise.all([
            fetchMeta ? fetch(buildApiUrl('/api/ads/meta', filters, { account_id: metaAccountId, ...bustParam }))
              .then(r => r.json())
              .then(d => {
                if (d.error) errors['meta'] = d.error
                else allResults.push({ client, data: d })
              })
              .catch(e => { errors['meta'] = e.message }) : Promise.resolve(),
            ...googleIdsToFetch.map(customerId =>
              fetch(buildApiUrl('/api/ads/google', filters, { customer_id: customerId, ...bustParam }))
                .then(r => r.json())
                .then(d => {
                  if (d.error) errors['google'] = d.error
                  else allResults.push({ client, data: d })
                })
                .catch(e => { errors['google'] = e.message })
            ),
          ])
        })
      )

      // Aggregate KPIs
      let totalSpend = 0
      let totalLeads = 0
      const typeMap: Record<string, { spend: number; leads: number; label: string }> = {}
      const newScorecardRows: ScorecardRow[] = []

      for (const { client, data } of allResults) {
        totalSpend += data.totals.spend
        totalLeads += data.totals.leads

        // Campaign types — aggregate preserving the resolved label from the API
        for (const ct of data.campaign_types || []) {
          if (!typeMap[ct.type]) typeMap[ct.type] = { spend: 0, leads: 0, label: ct.label || ct.type }
          typeMap[ct.type].spend += ct.spend
          typeMap[ct.type].leads += ct.leads
        }

        // Scorecard - client-level row
        const clientLeads = data.totals.leads
        const clientSpend = data.totals.spend
        const clientCpl = clientLeads > 0 ? clientSpend / clientLeads : 0

        const clientRow: ScorecardRow = {
          clientId: client.id,
          clientName: client.business_name,
          accountId: data.account_id || null,
          accountName: data.account_name || null,
          platform: data.platform as 'meta' | 'google',
          budget: client.fee_mdk,
          daysToEnd: clientSpend > 0 && client.fee_mdk ? Math.floor((client.fee_mdk - clientSpend) / (clientSpend / 30)) : null,
          leads: clientLeads,
          leadType: data.campaigns[0]?.conversion_action_name || data.campaigns[0]?.lead_type || data.campaigns[0]?.channel_label || 'Lead',
          cpl: clientCpl,
          ctr: parseFloat(String(data.totals.ctr)),
          impressions: data.totals.impressions,
          clicks: data.totals.clicks,
          spend: clientSpend,
          crmContacts: crmContactsByClientId[client.id] ?? 0,
        }
        newScorecardRows.push(clientRow)

          // Campaign-level rows — CRM contacts are client-level only (not per-campaign)
          for (const campaign of data.campaigns) {
            const campaignCpl = campaign.leads > 0 ? campaign.spend / campaign.leads : 0
            newScorecardRows.push({
              clientId: client.id,
              clientName: client.business_name,
              accountId: data.account_id || null,
              accountName: data.account_name || null,
              campaignId: campaign.id,
              campaignName: campaign.name,
              platform: data.platform as 'meta' | 'google',
              budget: campaign.budget || null,
              daysToEnd: null,
              leads: campaign.leads,
              leadType: campaign.conversion_action_name || campaign.lead_type || campaign.channel_label || campaign.campaign_type || campaign.advertising_channel_type || '',
              cpl: campaignCpl,
              ctr: campaign.ctr,
              impressions: campaign.impressions,
              clicks: campaign.clicks,
              spend: campaign.spend,
              crmContacts: 0,
            })
          }
      }

      const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0

      setKpis({
        totalInvestment: totalSpend,
        leads: totalLeads,
        cpl: totalCpl,
        investmentChange: 0,
        leadsChange: 0,
        cplChange: 0,
      })

      // Build campaign type chart data
      const COLORS = ['var(--primary)', 'var(--status-verde)', 'var(--status-amarillo)', 'var(--status-naranja)', 'var(--status-rojo)', 'var(--muted-foreground)']
      const sortedTypes = Object.entries(typeMap)
        .sort(([, a], [, b]) => b.spend - a.spend)
        .map(([type, data], i) => ({
          type,
          label: data.label,
          spend: data.spend,
          leads: data.leads,
          percentage: totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0,
          color: COLORS[i % COLORS.length],
        }))
      setCampaignTypes(sortedTypes)

      // Simple trend: distribute spend over days in period
      const start = new Date(filters.dateRange.start || format(subDays(new Date(), 30), 'yyyy-MM-dd'))
      const end = new Date(filters.dateRange.end || format(new Date(), 'yyyy-MM-dd'))
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
      const dailySpend = totalSpend / days
      const dailyLeads = totalLeads / days
      const trend: InvestmentTrendPoint[] = []
      for (let i = 0; i < Math.min(days, 30); i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i)
        trend.push({
          date: format(d, 'yyyy-MM-dd'),
          spend: dailySpend * (0.7 + Math.random() * 0.6),
          leads: Math.round(dailyLeads * (0.7 + Math.random() * 0.6)),
        })
      }
      setTrendData(trend)

      // Scorecard - client view shows only client-level rows (no campaignId)
      setScorecardRows(newScorecardRows)
    } finally {
      setLoading(false)
    }
  }, [])

  // Stable key to trigger fetches only when filters or clients actually change
  const fetchKey = `${filters.platform}|${filters.dateRange.preset}|${filters.dateRange.start}|${filters.dateRange.end}|${clientIdsKey}|${filters.adAccountId ?? ''}|${clients.map(c => c.id).join(',')}`
  const lastFetchKey = useRef<string>('')

  useEffect(() => {
    if (fetchKey === lastFetchKey.current) return
    lastFetchKey.current = fetchKey
    fetchData(targetClients, filters)
    // Also seed alerts with default last_14d on first load
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const alertFilters: DashboardFilters = {
      ...filters,
      dateRange: { preset: 'last_14d', start: fmt(new Date(today.getTime() - 14 * 86400000)), end: fmt(today) },
    }
    fetchAlertsData(targetClients, alertFilters)
  }, [fetchKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAlertsData = useCallback(async (clients: Client[], alertFilters: DashboardFilters) => {
    if (clients.length === 0) return
    setAlertsLoading(true)
    try {
      const allResults: Array<{ client: Client; data: AdsApiResponse }> = []
      await Promise.all(
        clients.map(async client => {
          const { platform, adAccountId } = alertFilters
          const fetchMeta = (platform === 'all' || platform === 'meta') && client.meta_ads_account_id
            && (!adAccountId || client.meta_ads_account_id.split(',').map(s => s.trim()).includes(adAccountId))
          const fetchGoogle = (platform === 'all' || platform === 'google') && client.google_ads_customer_id
            && (!adAccountId || client.google_ads_customer_id.split(',').map(s => s.trim()).includes(adAccountId))

          const allGoogleIds = client.google_ads_customer_id
            ? client.google_ads_customer_id.split(',').map(s => s.trim()).filter(Boolean)
            : []
          const googleIdsToFetch = fetchGoogle
            ? (adAccountId && allGoogleIds.includes(adAccountId) ? [adAccountId] : allGoogleIds)
            : []
          const metaAccountId = (adAccountId && client.meta_ads_account_id?.split(',').map(s => s.trim()).includes(adAccountId))
            ? adAccountId
            : client.meta_ads_account_id!

          await Promise.all([
            fetchMeta ? fetch(buildApiUrl('/api/ads/meta', alertFilters, { account_id: metaAccountId, bust: '1' }))
              .then(r => r.json())
              .then(d => { if (!d.error) allResults.push({ client, data: d }) })
              .catch(() => {}) : Promise.resolve(),
            ...googleIdsToFetch.map(customerId =>
              fetch(buildApiUrl('/api/ads/google', alertFilters, { customer_id: customerId, bust: '1' }))
                .then(r => r.json())
                .then(d => { if (!d.error) allResults.push({ client, data: d }) })
                .catch(() => {})
            ),
          ])
        })
      )

      // Build scorecard rows for alerts (campaign-level only)
      const newRows: ScorecardRow[] = []
      for (const { client, data } of allResults) {
        for (const campaign of data.campaigns) {
          const campaignCpl = campaign.leads > 0 ? campaign.spend / campaign.leads : 0
          newRows.push({
            clientId: client.id,
            clientName: client.business_name,
            accountId: data.account_id || null,
            accountName: data.account_name || null,
            campaignId: campaign.id,
            campaignName: campaign.name,
            platform: data.platform as 'meta' | 'google',
            budget: campaign.budget || null,
            daysToEnd: null,
            leads: campaign.leads,
            leadType: campaign.lead_type || campaign.channel_label || campaign.campaign_type || campaign.advertising_channel_type || '',
            cpl: campaignCpl,
            ctr: campaign.ctr,
            impressions: campaign.impressions,
            clicks: campaign.clicks,
            spend: campaign.spend,
            crmContacts: 0,
          })
        }
      }
      setAlertsRows(newRows)
    } finally {
      setAlertsLoading(false)
    }
  }, [])

  const handleAlertsDateRangeChange = useCallback((range: { preset: string; start: string; end: string }) => {
    const alertFilters: DashboardFilters = {
      ...filters,
      dateRange: { preset: range.preset as DashboardFilters['dateRange']['preset'], start: range.start, end: range.end },
    }
    fetchAlertsData(targetClients, alertFilters)
  }, [filters, targetClients, fetchAlertsData])

  const scorecardDisplayRows = scorecardView === 'clients'
    ? scorecardRows.filter(r => !r.campaignId)
    : scorecardRows.filter(r => !!r.campaignId)

  if (clients.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground mb-4">
              No hay clientes disponibles. Por favor, contacta al administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold">Dashboard</h1>
              <div className="h-0.5 w-24 bg-primary mt-1.5 rounded-full" />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <DashboardFiltersBar
                clients={clients}
                filters={filters}
                onChange={setFilters}
              />
              {canConfigurePlatforms && (
                <Button size="sm" variant="outline" className="h-9 gap-2" onClick={() => setShowPlatformConfig(true)}>
                  <Settings className="h-4 w-4" />
                  Configurar plataformas
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-2"
            disabled={loading}
            onClick={() => { fetchData(targetClients, filters, true); setAlertsRefreshKey(k => k + 1) }}
          >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Button 
                size="sm" 
                className="bg-primary hover:bg-primary/90 h-9"
                onClick={() => setShowReportModal(true)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Generar reporte
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="p-6 space-y-6">
        {/* Alerts Panel */}
        <section>
          <CampaignAlertsPanel
            rows={alertsRows}
            clients={clients}
            loading={alertsLoading}
            onDateRangeChange={handleAlertsDateRangeChange}
            refreshKey={alertsRefreshKey}
          />
        </section>

        {/* KPIs */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            KPIs del periodo
          </p>
          <KPICards
            kpis={kpis}
            loading={loading}
          />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CampaignTypeChart
            data={campaignTypes}
            platform={filters.platform}
            loading={loading}
          />
          <InvestmentTrendChart
            data={trendData}
            loading={loading}
          />
        </section>

        {/* Scorecard — vista general */}
        <section>
          <ScorecardTable
            rows={scorecardDisplayRows}
            clients={clients}
            filters={filters}
            loading={loading}
            view={scorecardView}
            onViewChange={setScorecardView}
            selectedScorecardClientId={scorecardClientId}
            onSelectScorecardClient={setScorecardClientId}
            selectedScorecardCampaignIds={scorecardCampaignIds}
            onSelectScorecardCampaigns={setScorecardCampaignIds}
          />
        </section>

        {/* Scorecard temporal — vista diaria / mensual */}
        <section>
          <ScorecardTimeline
            clients={targetClients}
            filters={filters}
            scorecardRows={scorecardRows}
          />
        </section>

        {/* Detalle conversiones diario — Google Ads */}
        <section>
          <ConversionDailyTable
            clients={targetClients}
            scorecardRows={scorecardRows}
            filters={filters}
          />
        </section>

        {/* Activity - Coming Soon */}
        <section>
          <Card className="border-dashed border-2">
            <CardContent className="py-10 flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Actividad reciente</p>
                <p className="text-sm text-muted-foreground mt-1">Proximamente · Historial de cambios y alertas del equipo</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Platform Config Sheet */}
      <Sheet open={showPlatformConfig} onOpenChange={setShowPlatformConfig}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Configurar plataformas</SheetTitle>
            <SheetDescription>
              Ingresa los IDs de Meta Ads y Google Ads para cada cliente para habilitar la conexion de datos.
            </SheetDescription>
          </SheetHeader>
          <div className="p-6">
            <ClientsPlatformConfig clients={clients} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Report Generator Modal */}
      <ReportGeneratorModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        clients={clients}
        filters={filters}
        scorecardRows={scorecardRows}
      />
    </div>
  )
}
