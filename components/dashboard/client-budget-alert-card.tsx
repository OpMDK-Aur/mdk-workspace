'use client'

import { useState } from 'react'
import type { ClientBudgetAlert, BudgetPlatformSummary, BudgetCampaignAlert } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDown, Clock, ShieldAlert, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BudgetAlertBadge,
  BudgetConsumptionProgress,
  PlatformBadge,
  ALERT_CONFIG,
  STATUS_ORDER,
  getOverallStatus,
  formatCurrency,
} from './budget-alerts-shared'

// ── Trend icon ────────────────────────────────────────────────────────────────
function TrendIcon({ trend }: { trend: BudgetCampaignAlert['trend'] }) {
  if (trend === 'very_fast' || trend === 'fast') {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <TrendingUp className={cn('h-3.5 w-3.5 shrink-0', trend === 'very_fast' ? 'text-red-400' : 'text-amber-400')} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {trend === 'very_fast' ? 'Riesgo de sobreconsumo' : 'Gasto acelerado'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  if (trend === 'very_slow' || trend === 'slow') {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <TrendingDown className={cn('h-3.5 w-3.5 shrink-0', trend === 'very_slow' ? 'text-violet-400' : 'text-blue-400')} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {trend === 'very_slow' ? 'Subdelivery severo' : 'Gasto lento'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Ritmo normal</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Campaign row ──────────────────────────────────────────────────────────────
function CampaignRow({ campaign }: { campaign: BudgetCampaignAlert }) {
  const cfg = ALERT_CONFIG[campaign.status]
  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2 transition-all',
      campaign.status === 'normal'
        ? 'border-border/40 bg-muted/20'
        : cn('border', cfg.border, cfg.bg)
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <TrendIcon trend={campaign.trend} />
            <p className="text-xs font-medium text-foreground truncate">{campaign.name}</p>
          </div>
          {campaign.type && (
            <span className="text-[10px] text-muted-foreground/60 font-mono uppercase">{campaign.type}</span>
          )}
        </div>
        <BudgetAlertBadge status={campaign.status} size="xs" />
      </div>

      <BudgetConsumptionProgress
        pct={campaign.consumed_percent}
        status={campaign.status}
        investment={campaign.investment}
        budget={campaign.budget}
      />

      <p className="text-[11px] text-muted-foreground">{campaign.message}</p>
    </div>
  )
}

// ── Platform section ──────────────────────────────────────────────────────────
function PlatformSection({
  platform,
  summary,
}: {
  platform: 'meta' | 'google'
  summary: BudgetPlatformSummary
}) {
  const [expanded, setExpanded] = useState(summary.status !== 'normal')
  const cfg = ALERT_CONFIG[summary.status]

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className={cn(
        'rounded-xl border p-4 space-y-3',
        summary.status === 'normal'
          ? 'border-border/50 bg-muted/20'
          : cn('border', cfg.border, cfg.bg)
      )}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={platform} />
            <BudgetAlertBadge status={summary.status} />
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 cursor-help">
                  <Clock className="h-3 w-3" />
                  {summary.last_sync
                    ? new Date(summary.last_sync).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                    : 'Sin datos'}
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

        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] text-muted-foreground leading-snug">{summary.projection_text}</p>
          <div className="flex gap-2 text-[10px] text-muted-foreground shrink-0">
            <span className="font-mono">{formatCurrency(summary.investment)}</span>
            <span>/</span>
            <span className="font-mono">{formatCurrency(summary.budget)}</span>
          </div>
        </div>

        {/* Campaign toggle */}
        {summary.campaigns.length > 0 && (
          <button
            onClick={() => setExpanded(o => !o)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
            {expanded ? 'Ocultar campañas' : `Ver ${summary.campaigns.length} campana${summary.campaigns.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Campaign list */}
      {expanded && summary.campaigns.length > 0 && (
        <div className="space-y-2 pl-2 border-l-2 border-border/30">
          {[...summary.campaigns]
            .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
            .map(c => <CampaignRow key={c.id} campaign={c} />)
          }
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface ClientBudgetAlertCardProps {
  alert: ClientBudgetAlert | null
  loading?: boolean
}

export function ClientBudgetAlertCard({ alert, loading }: ClientBudgetAlertCardProps) {
  const [activePlatform, setActivePlatform] = useState<'meta' | 'google' | 'both'>('both')

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  if (!alert) return null

  const hasGoogle = !!alert.google_ads
  const hasMeta   = !!alert.meta_ads
  const hasBoth   = hasGoogle && hasMeta

  if (!hasGoogle && !hasMeta) return null

  const overall = getOverallStatus(alert)
  const activeAlerts = [alert.meta_ads?.status, alert.google_ads?.status]
    .filter(s => s && s !== 'normal').length

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
            activeAlerts > 0 ? 'bg-red-500/10' : 'bg-muted'
          )}>
            <ShieldAlert className={cn('h-3.5 w-3.5', activeAlerts > 0 ? 'text-red-400' : 'text-muted-foreground')} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Estado de presupuesto publicitario</h3>
        </div>
        <BudgetAlertBadge status={overall} />
      </div>

      {/* Platform tabs — only if both platforms */}
      {hasBoth && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {([
            { value: 'both',   label: 'Ambas' },
            { value: 'meta',   label: 'Meta' },
            { value: 'google', label: 'Google' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setActivePlatform(opt.value)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                activePlatform === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Platform sections */}
      <div className="space-y-4">
        {hasMeta && (activePlatform === 'both' || activePlatform === 'meta') && (
          <PlatformSection platform="meta" summary={alert.meta_ads!} />
        )}
        {hasGoogle && (activePlatform === 'both' || activePlatform === 'google') && (
          <PlatformSection platform="google" summary={alert.google_ads!} />
        )}
      </div>
    </div>
  )
}
