'use client'

import { cn } from '@/lib/utils'
import type { BudgetAlertStatus, BudgetCampaignAlert, BudgetPlatformSummary, ClientBudgetAlert } from '@/lib/types'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Info } from 'lucide-react'

// ── Status config ─────────────────────────────────────────────────────────────
export const ALERT_CONFIG: Record<BudgetAlertStatus, {
  label: string
  bg: string
  text: string
  border: string
  bar: string
  dot: string
}> = {
  normal: {
    label: 'Normal',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-400',
  },
  attention: {
    label: 'Atencion',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    bar: 'bg-amber-400',
    dot: 'bg-amber-400',
  },
  critical: {
    label: 'Critica',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    bar: 'bg-red-500',
    dot: 'bg-red-400',
  },
  subdelivery: {
    label: 'Subdelivery',
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    bar: 'bg-violet-400',
    dot: 'bg-violet-400',
  },
}

export const STATUS_ORDER: BudgetAlertStatus[] = ['critical', 'attention', 'subdelivery', 'normal']

// ── Helpers ───────────────────────────────────────────────────────────────────
export function computeAlertStatus(
  consumedPct: number,
  gastoReal: number,
  gastoEsperado: number
): BudgetAlertStatus {
  if (consumedPct >= 0.95) return 'critical'
  if (gastoReal > gastoEsperado * 1.20 && consumedPct >= 0.80) return 'critical'
  if (consumedPct >= 0.80) return 'attention'
  if (gastoReal > gastoEsperado * 1.20) return 'attention'
  if (gastoEsperado > 0 && gastoReal < gastoEsperado * 0.60) return 'subdelivery'
  return 'normal'
}

export function generateProjectionText(
  consumedPct: number,
  status: BudgetAlertStatus,
  budget: number,
  investment: number
): string {
  const remaining = budget - investment
  if (status === 'critical') {
    if (consumedPct >= 0.95) return 'Riesgo alto de agotamiento en breve'
    return 'Al ritmo actual el presupuesto se agotaria antes de fin del periodo'
  }
  if (status === 'attention') return `Quedan $${remaining.toLocaleString('es-AR')} disponibles`
  if (status === 'subdelivery') return 'La inversion esta por debajo del ritmo esperado'
  return 'Consumo dentro de lo esperado'
}

export function formatCurrency(v: number, currency = 'ARS') {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export function computeClientBudgetAlerts(
  clientId: string,
  clientName: string,
  rows: Array<{
    campaignId?: string
    campaignName?: string
    platform: 'meta' | 'google'
    spend: number
    budget: number | null
    leadType: string
  }>
): ClientBudgetAlert {
  const now = new Date()
  const dayPct = (now.getHours() * 60 + now.getMinutes()) / (24 * 60)

  function buildPlatformSummary(platform: 'meta' | 'google'): BudgetPlatformSummary | null {
    const pRows = rows.filter(r => r.platform === platform && r.budget != null && r.budget > 0)
    if (pRows.length === 0) return null

    const totalInvestment = pRows.reduce((s, r) => s + r.spend, 0)
    const totalBudget = pRows.reduce((s, r) => s + (r.budget ?? 0), 0)
    const consumedPct = totalBudget > 0 ? totalInvestment / totalBudget : 0
    const expectedSpend = totalBudget * dayPct
    const status = computeAlertStatus(consumedPct, totalInvestment, expectedSpend)

    const campaigns: BudgetCampaignAlert[] = pRows.map(r => {
      const cPct = (r.budget ?? 0) > 0 ? r.spend / (r.budget ?? 1) : 0
      const cExpected = (r.budget ?? 0) * dayPct
      const cStatus = computeAlertStatus(cPct, r.spend, cExpected)
      const trend: BudgetCampaignAlert['trend'] =
        r.spend > cExpected * 1.5 ? 'very_fast' :
        r.spend > cExpected * 1.2 ? 'fast' :
        r.spend < cExpected * 0.3 ? 'very_slow' :
        r.spend < cExpected * 0.6 ? 'slow' : 'normal'

      return {
        id: r.campaignId ?? '',
        name: r.campaignName ?? 'Sin nombre',
        type: r.leadType || null,
        investment: r.spend,
        budget: r.budget ?? 0,
        consumed_percent: cPct,
        status: cStatus,
        trend,
        message: generateProjectionText(cPct, cStatus, r.budget ?? 0, r.spend),
      }
    }).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

    return {
      connected: true,
      account_status: 'active',
      currency: 'ARS',
      investment: totalInvestment,
      budget: totalBudget,
      consumed_percent: consumedPct,
      status,
      projection_text: generateProjectionText(consumedPct, status, totalBudget, totalInvestment),
      last_sync: new Date().toISOString(),
      campaigns,
    }
  }

  return {
    clientId,
    clientName,
    google_ads: buildPlatformSummary('google'),
    meta_ads: buildPlatformSummary('meta'),
  }
}

export function getOverallStatus(alert: ClientBudgetAlert): BudgetAlertStatus {
  const statuses = [alert.google_ads?.status, alert.meta_ads?.status].filter(Boolean) as BudgetAlertStatus[]
  if (!statuses.length) return 'normal'
  return statuses.sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))[0]
}

// ── BudgetAlertBadge ──────────────────────────────────────────────────────────
export function BudgetAlertBadge({ status, size = 'sm' }: { status: BudgetAlertStatus; size?: 'xs' | 'sm' }) {
  const cfg = ALERT_CONFIG[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-semibold',
      cfg.bg, cfg.text, cfg.border,
      size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
    )}>
      <span className={cn('rounded-full shrink-0', cfg.dot, size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2')} />
      {cfg.label}
    </span>
  )
}

// ── BudgetConsumptionProgress ─────────────────────────────────────────────────
export function BudgetConsumptionProgress({
  pct,
  status,
  showLabel = true,
  investment,
  budget,
}: {
  pct: number
  status: BudgetAlertStatus
  showLabel?: boolean
  investment?: number
  budget?: number
}) {
  const cfg = ALERT_CONFIG[status]
  const clamped = Math.min(pct, 1)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-1">
        {showLabel && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-foreground">
                {(pct * 100).toFixed(0)}% consumido
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-48">
                  <p>Porcentaje del presupuesto ya invertido.</p>
                  {investment != null && budget != null && (
                    <p className="mt-1 text-muted-foreground">
                      {formatCurrency(investment)} de {formatCurrency(budget)}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
            {investment != null && budget != null && (
              <span className="text-[10px] text-muted-foreground">
                {formatCurrency(investment)} / {formatCurrency(budget)}
              </span>
            )}
          </div>
        )}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', cfg.bar)}
            style={{ width: `${clamped * 100}%` }}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

// ── Platform badge ────────────────────────────────────────────────────────────
export function PlatformBadge({ platform }: { platform: 'meta' | 'google' }) {
  return platform === 'meta' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-semibold px-2 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />Meta Ads
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-semibold px-2 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />Google Ads
    </span>
  )
}

// ── MOCK DATA (all states) ────────────────────────────────────────────────────
export const MOCK_BUDGET_ALERTS: ClientBudgetAlert[] = [
  {
    clientId: 'mock-1',
    clientName: 'Cliente Ejemplo A',
    meta_ads: {
      connected: true, account_status: 'active', currency: 'ARS',
      investment: 93500, budget: 95000, consumed_percent: 0.984,
      status: 'critical',
      projection_text: 'Riesgo alto de agotamiento en breve',
      last_sync: new Date().toISOString(),
      campaigns: [
        { id: 'm1', name: 'Remarketing WhatsApp', type: 'LEADS', investment: 55000, budget: 55500, consumed_percent: 0.991, status: 'critical', trend: 'very_fast', message: 'Presupuesto casi agotado' },
        { id: 'm2', name: 'Trafico Frio', type: 'TRAFFIC', investment: 38500, budget: 39500, consumed_percent: 0.975, status: 'critical', trend: 'fast', message: 'Presupuesto proximo a agotarse' },
      ],
    },
    google_ads: {
      connected: true, account_status: 'active', currency: 'ARS',
      investment: 185000, budget: 220000, consumed_percent: 0.841,
      status: 'attention',
      projection_text: 'Quedan $35.000 disponibles',
      last_sync: new Date().toISOString(),
      campaigns: [
        { id: 'g1', name: 'Busqueda Cordoba', type: 'SEARCH', investment: 85000, budget: 100000, consumed_percent: 0.85, status: 'attention', trend: 'fast', message: 'Gasto al 85% del presupuesto' },
        { id: 'g2', name: 'Display Remarketing', type: 'DISPLAY', investment: 100000, budget: 120000, consumed_percent: 0.833, status: 'attention', trend: 'normal', message: 'Consumo dentro de lo esperado' },
      ],
    },
  },
  {
    clientId: 'mock-2',
    clientName: 'Cliente Ejemplo B',
    meta_ads: {
      connected: true, account_status: 'active', currency: 'ARS',
      investment: 12000, budget: 80000, consumed_percent: 0.15,
      status: 'subdelivery',
      projection_text: 'La inversion esta por debajo del ritmo esperado',
      last_sync: new Date().toISOString(),
      campaigns: [
        { id: 'm3', name: 'Leads Formulario', type: 'LEADS', investment: 12000, budget: 80000, consumed_percent: 0.15, status: 'subdelivery', trend: 'very_slow', message: 'Gasto por debajo del ritmo esperado' },
      ],
    },
    google_ads: null,
  },
  {
    clientId: 'mock-3',
    clientName: 'Cliente Ejemplo C',
    google_ads: {
      connected: true, account_status: 'active', currency: 'ARS',
      investment: 45000, budget: 100000, consumed_percent: 0.45,
      status: 'normal',
      projection_text: 'Consumo dentro de lo esperado',
      last_sync: new Date().toISOString(),
      campaigns: [
        { id: 'g3', name: 'Performance Max', type: 'PERFORMANCE_MAX', investment: 45000, budget: 100000, consumed_percent: 0.45, status: 'normal', trend: 'normal', message: 'Consumo dentro de lo esperado' },
      ],
    },
    meta_ads: null,
  },
]
