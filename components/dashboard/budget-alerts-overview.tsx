'use client'

import { useState, useMemo } from 'react'
import type { ClientBudgetAlert, BudgetAlertStatus, ScorecardRow, Client } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Search, ShieldAlert, Clock, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BudgetAlertBadge,
  BudgetConsumptionProgress,
  PlatformBadge,
  ALERT_CONFIG,
  STATUS_ORDER,
  computeClientBudgetAlerts,
  getOverallStatus,
  formatCurrency,
} from './budget-alerts-shared'

interface BudgetAlertsOverviewProps {
  rows: ScorecardRow[]
  clients: Client[]
  loading?: boolean
}

type FilterOption = 'all' | 'meta' | 'google' | 'critical' | 'attention' | 'subdelivery'

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all',        label: 'Todas las plataformas' },
  { value: 'meta',       label: 'Meta Ads' },
  { value: 'google',     label: 'Google Ads' },
  { value: 'critical',   label: 'Solo criticas' },
  { value: 'attention',  label: 'Solo atencion' },
  { value: 'subdelivery',label: 'Solo subdelivery' },
]

function formatSyncTime(iso: string | null) {
  if (!iso) return 'Sin datos'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// ── Platform row ──────────────────────────────────────────────────────────────
function PlatformRow({
  platform,
  summary,
}: {
  platform: 'meta' | 'google'
  summary: NonNullable<ClientBudgetAlert['meta_ads']>
}) {
  const cfg = ALERT_CONFIG[summary.status]
  return (
    <div className={cn(
      'rounded-lg border px-4 py-3 space-y-2 transition-all',
      summary.status === 'normal' ? 'border-border/50 bg-muted/20' : cn('border', cfg.border, cfg.bg + '/40')
    )}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PlatformBadge platform={platform} />
          <BudgetAlertBadge status={summary.status} size="xs" />
        </div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 cursor-help">
                <Clock className="h-3 w-3" />
                {formatSyncTime(summary.last_sync)}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Ultima sincronizacion</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <BudgetConsumptionProgress
        pct={summary.consumed_percent}
        status={summary.status}
        investment={summary.investment}
        budget={summary.budget}
      />

      <p className="text-[11px] text-muted-foreground leading-snug">
        {summary.projection_text}
      </p>
    </div>
  )
}

// ── Client alert card ─────────────────────────────────────────────────────────
function ClientAlertCard({ alert }: { alert: ClientBudgetAlert }) {
  const overall = getOverallStatus(alert)
  const cfg = ALERT_CONFIG[overall]

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3 transition-all',
      overall === 'normal'
        ? 'border-border/50 bg-card'
        : cn('border', cfg.border, 'bg-card')
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
          <p className="text-sm font-semibold text-foreground truncate">{alert.clientName}</p>
        </div>
        <BudgetAlertBadge status={overall} />
      </div>

      <div className="space-y-2">
        {alert.meta_ads && (
          <PlatformRow platform="meta" summary={alert.meta_ads} />
        )}
        {alert.google_ads && (
          <PlatformRow platform="google" summary={alert.google_ads} />
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function BudgetAlertsOverview({ rows, clients, loading }: BudgetAlertsOverviewProps) {
  const [filterOption, setFilterOption] = useState<FilterOption>('all')
  const [search, setSearch] = useState('')

  const alerts: ClientBudgetAlert[] = useMemo(() => {
    // Group rows by client
    const byClient = new Map<string, ScorecardRow[]>()
    for (const r of rows) {
      if (!byClient.has(r.clientId)) byClient.set(r.clientId, [])
      byClient.get(r.clientId)!.push(r)
    }
    return Array.from(byClient.entries())
      .map(([clientId, cRows]) => {
        const client = clients.find(c => c.id === clientId)
        return computeClientBudgetAlerts(
          clientId,
          client?.business_name ?? clientId,
          cRows.map(r => ({
            campaignId:   r.campaignId,
            campaignName: r.campaignName,
            platform:     r.platform,
            spend:        r.spend,
            budget:       r.budget,
            leadType:     r.leadType,
          }))
        )
      })
  }, [rows, clients])

  const filtered = useMemo(() => {
    let result = [...alerts]

    // Platform / status filter
    if (filterOption === 'meta')       result = result.filter(a => a.meta_ads)
    if (filterOption === 'google')     result = result.filter(a => a.google_ads)
    if (filterOption === 'critical')   result = result.filter(a => getOverallStatus(a) === 'critical')
    if (filterOption === 'attention')  result = result.filter(a => getOverallStatus(a) === 'attention')
    if (filterOption === 'subdelivery')result = result.filter(a => getOverallStatus(a) === 'subdelivery')

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(a => a.clientName.toLowerCase().includes(q))
    }

    // Sort: critical first
    result.sort((a, b) =>
      STATUS_ORDER.indexOf(getOverallStatus(a)) - STATUS_ORDER.indexOf(getOverallStatus(b))
    )
    return result
  }, [alerts, filterOption, search])

  const criticalCount   = alerts.filter(a => getOverallStatus(a) === 'critical').length
  const attentionCount  = alerts.filter(a => getOverallStatus(a) === 'attention').length
  const subdelivCount   = alerts.filter(a => getOverallStatus(a) === 'subdelivery').length
  const activeAlerts    = criticalCount + attentionCount + subdelivCount

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
            activeAlerts > 0 ? 'bg-red-500/10' : 'bg-muted'
          )}>
            <ShieldAlert className={cn('h-4 w-4', activeAlerts > 0 ? 'text-red-400' : 'text-muted-foreground')} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Alertas de presupuesto</h2>
            {activeAlerts > 0 ? (
              <div className="flex items-center gap-2 mt-0.5">
                {criticalCount > 0 && (
                  <span className="text-[10px] text-red-400 font-semibold">{criticalCount} critica{criticalCount !== 1 ? 's' : ''}</span>
                )}
                {attentionCount > 0 && (
                  <span className="text-[10px] text-amber-400 font-semibold">{attentionCount} atencion</span>
                )}
                {subdelivCount > 0 && (
                  <span className="text-[10px] text-violet-400 font-semibold">{subdelivCount} subdelivery</span>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">Sin alertas activas</p>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterOption(opt.value)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all',
              filterOption === opt.value
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border/50 p-4 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No hay alertas de presupuesto activas</p>
              <p className="text-xs text-muted-foreground mt-1">
                {search ? `Sin resultados para "${search}"` : 'Todos los presupuestos estan dentro de los parametros normales.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(alert => (
            <ClientAlertCard key={alert.clientId} alert={alert} />
          ))}
        </div>
      )}
    </div>
  )
}
