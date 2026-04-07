'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Client, ScorecardRow, ClientBudgetAlert } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ShieldAlert, Search, RefreshCw, Clock, AlertTriangle, ChevronDown, ChevronUp, TrendingDown, HelpCircle } from 'lucide-react'
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
import type { AccountBudgetResult } from '@/app/api/ads/google/account-budget/route'
import type { MetaAccountBudgetResult } from '@/app/api/ads/meta/account-budget/route'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SaldosContentProps {
  clients: Pick<Client, 'id' | 'business_name' | 'meta_ads_account_id' | 'google_ads_customer_id' | 'status'>[]
}

type FilterOption = 'all' | 'meta' | 'google' | 'critical' | 'attention' | 'subdelivery'

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all',         label: 'Todos' },
  { value: 'meta',        label: 'Meta Ads' },
  { value: 'google',      label: 'Google Ads' },
  { value: 'critical',    label: 'Critico' },
  { value: 'attention',   label: 'Atencion' },
  { value: 'subdelivery', label: 'Subdelivery' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSyncTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// ── Number formatter — full number, 2 decimals, thousands separator ───────────
function formatAmount(value: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// ── Account Budget Card ────────────────────────────────────────────────────────
type BudgetFetchState = 'idle' | 'loading' | 'done' | 'error'

function AccountBudgetCard({
  customerId,
  refreshTrigger,
  onNameResolved,
}: {
  customerId: string
  refreshTrigger: number
  onNameResolved?: (id: string, name: string) => void
}) {
  const [state, setState]   = useState<BudgetFetchState>('loading')
  const [data, setData]     = useState<AccountBudgetResult | null>(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!customerId) return
    setState('loading')
    setData(null)
    setErrMsg('')
    fetch(`/api/ads/google/account-budget?customer_id=${encodeURIComponent(customerId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setErrMsg(json.error); setState('error'); return }
        const result: AccountBudgetResult | null = json.data ?? null
        setData(result)
        if (result?.accountName) onNameResolved?.(customerId, result.accountName)
        setState('done')
      })
      .catch(e => { setErrMsg(e.message ?? 'Error desconocido'); setState('error') })
  }, [customerId, refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLow = data && data.saldoDisponible <= 0
  const pctUsed = data && (data.limiteAjustado > 0 || data.limiteAprobado > 0)
    ? (data.montoServido / (data.limiteAjustado > 0 ? data.limiteAjustado : data.limiteAprobado)) * 100
    : null
  const isWarn = pctUsed !== null && pctUsed >= 80 && !isLow

  return (
    <Card className={cn(
      'overflow-hidden relative border',
      isLow  ? 'border-red-500/40 bg-red-500/5'
      : isWarn ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-border/60'
    )}>
      <div className={cn(
        'h-0.5 w-full absolute top-0 left-0',
        isLow ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-blue-500'
      )} />
      <CardContent className="pt-5 pb-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {data?.accountName ? data.accountName : 'Saldo presupuestario API'}
              </p>
              {data?.accountName && (
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: {customerId}</p>
              )}
            </div>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-64 leading-relaxed">
                  Este valor representa el saldo presupuestario calculado desde Google Ads como limite ajustado menos monto servido. No equivale al saldo contable de facturacion.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {(isLow || isWarn) && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0',
              isLow ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
            )}>
              <TrendingDown className="h-3 w-3" />
              {isLow ? 'Saldo agotado' : 'Saldo bajo'}
            </span>
          )}
        </div>

        {/* States */}
        {state === 'loading' && (
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-40" />
          </div>
        )}

        {state === 'error' && (
          <p className="text-sm text-destructive leading-snug">No se pudo obtener el saldo presupuestario. <span className="text-muted-foreground">{errMsg}</span></p>
        )}

        {state === 'done' && !data && (
          <p className="text-sm text-muted-foreground">No hay datos de saldo presupuestario disponibles.</p>
        )}

        {state === 'done' && data && (
          <div className="space-y-3">
            {/* Main value */}
            <div>
              <p className={cn(
                'text-3xl font-bold tracking-tight tabular-nums',
                isLow ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-foreground'
              )}>
                {formatAmount(data.saldoDisponible)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Disponible (limite ajustado − monto servido)</p>
            </div>

            {/* Progress bar */}
            {pctUsed !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Consumo</span>
                  <span className={cn(isLow ? 'text-red-400' : isWarn ? 'text-amber-400' : '')}>{pctUsed.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      isLow ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-blue-500'
                    )}
                    style={{ width: `${Math.min(pctUsed, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div className="space-y-1 border-t border-border/40 pt-2.5">
              {data.limiteAjustado > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Limite ajustado</span>
                  <span className="font-medium tabular-nums">{formatAmount(data.limiteAjustado)}</span>
                </div>
              )}
              {data.limiteAprobado > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Limite aprobado</span>
                  <span className="font-medium tabular-nums">{formatAmount(data.limiteAprobado)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Monto servido</span>
                <span className="font-medium tabular-nums">{formatAmount(data.montoServido)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}



// ── Account Budget Card with multi-account selector ───────────────────────────
function ClientAccountBudgetSection({
  client,
  refreshTrigger,
}: {
  client: Pick<Client, 'id' | 'business_name' | 'google_ads_customer_id'>
  refreshTrigger: number
}) {
  const accountIds = (client.google_ads_customer_id ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const [selectedId, setSelectedId] = useState(accountIds[0] ?? '')
  const [accountNames, setAccountNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (accountIds.length > 0 && !accountIds.includes(selectedId)) {
      setSelectedId(accountIds[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.google_ads_customer_id])

  const handleNameResolved = useCallback((id: string, name: string) => {
    setAccountNames(prev => prev[id] === name ? prev : { ...prev, [id]: name })
  }, [])

  if (accountIds.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium truncate px-0.5">{client.business_name}</p>

      {accountIds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {accountIds.map(id => {
            const name = accountNames[id]
            return (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] transition-all flex items-center gap-1.5',
                  selectedId === id
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
                )}
              >
                {name ? (
                  <>
                    <span className="font-medium">{name}</span>
                    <span className={cn('font-mono opacity-60', selectedId === id ? 'text-background/70' : 'text-muted-foreground/60')}>{id}</span>
                  </>
                ) : (
                  <span className="font-mono">{id}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <AccountBudgetCard
        customerId={selectedId}
        refreshTrigger={refreshTrigger}
        onNameResolved={handleNameResolved}
      />
    </div>
  )
}

// ── Meta Account Budget Card ───────────────────────────────────────────────────
function MetaAccountBudgetCard({
  accountId,
  refreshTrigger,
  onNameResolved,
}: {
  accountId: string
  refreshTrigger: number
  onNameResolved?: (id: string, name: string) => void
}) {
  const [state, setState] = useState<BudgetFetchState>('loading')
  const [data, setData]   = useState<MetaAccountBudgetResult | null>(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!accountId) return
    setState('loading')
    setData(null)
    setErrMsg('')
    fetch(`/api/ads/meta/account-budget?account_id=${encodeURIComponent(accountId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setErrMsg(json.error); setState('error'); return }
        const result: MetaAccountBudgetResult | null = json.data ?? null
        setData(result)
        if (result?.adAccountName) onNameResolved?.(accountId, result.adAccountName)
        setState('done')
      })
      .catch(e => { setErrMsg(e.message ?? 'Error desconocido'); setState('error') })
  }, [accountId, refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const pctUsed = data?.hasSpendCap && data.spendCap > 0
    ? (data.amountSpent / data.spendCap) * 100
    : null
  const isLow  = data?.hasSpendCap && (data.saldoPresupuestario ?? 1) <= 0
  const isWarn = pctUsed !== null && pctUsed >= 80 && !isLow

  const fmt = (val: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: data?.currency ?? 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val)

  return (
    <Card className={cn(
      'overflow-hidden relative border',
      isLow  ? 'border-red-500/40 bg-red-500/5'
      : isWarn ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-border/60'
    )}>
      <div className={cn(
        'h-0.5 w-full absolute top-0 left-0',
        isLow ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-blue-400'
      )} />
      <CardContent className="pt-5 pb-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">
                {data?.adAccountName || 'Saldo presupuestario Meta'}
              </p>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-64 leading-relaxed">
                    Se calcula como spend cap menos amount spent. No equivale al balance contable de Meta. El balance representa deuda pendiente, no saldo disponible.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {data?.adAccountName && (
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: act_{accountId}</p>
            )}
          </div>
          {(isLow || isWarn) && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0',
              isLow ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
            )}>
              <TrendingDown className="h-3 w-3" />
              {isLow ? 'Saldo agotado' : 'Saldo bajo'}
            </span>
          )}
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-40" />
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <p className="text-sm text-destructive leading-snug">
            No se pudo obtener el saldo presupuestario de Meta.{' '}
            <span className="text-muted-foreground">{errMsg}</span>
          </p>
        )}

        {/* No data */}
        {state === 'done' && !data && (
          <p className="text-sm text-muted-foreground">No hay datos de saldo presupuestario Meta disponibles.</p>
        )}

        {/* Data */}
        {state === 'done' && data && (
          <div className="space-y-3">
            {/* Main value */}
            {data.hasSpendCap ? (
              <div>
                <p className={cn(
                  'text-3xl font-bold tracking-tight tabular-nums',
                  isLow ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-foreground'
                )}>
                  {fmt(data.saldoPresupuestario!)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Disponible (spend cap − amount spent)</p>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/40 border border-border/40 px-3 py-2.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Esta cuenta no tiene spend cap configurado, por lo que no es posible calcular saldo presupuestario.
                </p>
              </div>
            )}

            {/* Progress bar — only when spend_cap exists */}
            {data.hasSpendCap && pctUsed !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Consumo</span>
                  <span className={cn(isLow ? 'text-red-400' : isWarn ? 'text-amber-400' : '')}>{pctUsed.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      isLow ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-blue-400'
                    )}
                    style={{ width: `${Math.min(pctUsed, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div className="space-y-1 border-t border-border/40 pt-2.5">
              {data.hasSpendCap && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Spend cap</span>
                  <span className="font-medium tabular-nums">{fmt(data.spendCap)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Monto gastado</span>
                <span className="font-medium tabular-nums">{fmt(data.amountSpent)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-medium tabular-nums">{fmt(data.balance)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Moneda</span>
                <span className="font-medium">{data.currency}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Meta multi-account selector ────────────────────────────────────────────────
function ClientMetaBudgetSection({
  client,
  refreshTrigger,
}: {
  client: Pick<Client, 'id' | 'business_name' | 'meta_ads_account_id'>
  refreshTrigger: number
}) {
  const accountIds = (client.meta_ads_account_id ?? '')
    .split(',')
    .map(s => s.trim().replace(/^act_/, ''))
    .filter(Boolean)

  const [selectedId, setSelectedId]     = useState(accountIds[0] ?? '')
  const [accountNames, setAccountNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (accountIds.length > 0 && !accountIds.includes(selectedId)) {
      setSelectedId(accountIds[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.meta_ads_account_id])

  const handleNameResolved = useCallback((id: string, name: string) => {
    setAccountNames(prev => prev[id] === name ? prev : { ...prev, [id]: name })
  }, [])

  if (accountIds.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground font-medium truncate px-0.5">{client.business_name}</p>

      {accountIds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {accountIds.map(id => {
            const name = accountNames[id]
            return (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] transition-all flex items-center gap-1.5',
                  selectedId === id
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
                )}
              >
                {name ? (
                  <>
                    <span className="font-medium">{name}</span>
                    <span className={cn('font-mono opacity-60', selectedId === id ? 'text-background/70' : 'text-muted-foreground/60')}>{id}</span>
                  </>
                ) : (
                  <span className="font-mono">{id}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <MetaAccountBudgetCard
        accountId={selectedId}
        refreshTrigger={refreshTrigger}
        onNameResolved={handleNameResolved}
      />
    </div>
  )
}

function PlatformBlock({
  platform,
  summary,
}: {
  platform: 'meta' | 'google'
  summary: NonNullable<ClientBudgetAlert['meta_ads']>
}) {
  const cfg = ALERT_CONFIG[summary.status]
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'rounded-lg border px-4 py-3 space-y-2.5',
      summary.status === 'normal'
        ? 'border-border/50 bg-muted/20'
        : cn('border', cfg.border, cfg.bg + '/40')
    )}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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

      {/* Progress */}
      <BudgetConsumptionProgress
        pct={summary.consumed_percent}
        status={summary.status}
        investment={summary.investment}
        budget={summary.budget}
      />

      {/* Projection */}
      <p className="text-[11px] text-muted-foreground">{summary.projection_text}</p>

      {/* Campaign breakdown toggle */}
      {summary.campaigns.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded
              ? <><ChevronUp className="h-3 w-3" /> Ocultar campanas</>
              : <><ChevronDown className="h-3 w-3" /> Ver {summary.campaigns.length} campana{summary.campaigns.length !== 1 ? 's' : ''}</>
            }
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5">
              {summary.campaigns.map(c => {
                const ccfg = ALERT_CONFIG[c.status]
                return (
                  <div key={c.id} className={cn(
                    'rounded-md border px-3 py-2 text-[11px] space-y-1',
                    c.status === 'normal' ? 'border-border/40 bg-muted/10' : cn('border', ccfg.border, ccfg.bg + '/30')
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground truncate flex-1">{c.name || 'Sin nombre'}</span>
                      <BudgetAlertBadge status={c.status} size="xs" />
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{formatCurrency(c.investment)} invertidos</span>
                      {c.budget ? <span>de {formatCurrency(c.budget)}</span> : null}
                      <span className={cn('font-semibold', ccfg.text)}>{c.consumed_percent.toFixed(0)}%</span>
                    </div>
                    {c.message && <p className="text-muted-foreground/80 leading-snug">{c.message}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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
      {/* Client name + status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
          <p className="text-sm font-semibold text-foreground truncate">{alert.clientName}</p>
        </div>
        <BudgetAlertBadge status={overall} />
      </div>

      {/* Platforms */}
      <div className="space-y-2">
        {alert.meta_ads   && <PlatformBlock platform="meta"   summary={alert.meta_ads} />}
        {alert.google_ads && <PlatformBlock platform="google" summary={alert.google_ads} />}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function SaldosContent({ clients }: SaldosContentProps) {
  const [rows, setRows]               = useState<ScorecardRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [filter, setFilter]           = useState<FilterOption>('all')
  const [search, setSearch]           = useState('')
  const [refreshTick, setRefreshTick] = useState(0)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const today    = new Date()
    const monthAgo = new Date(today)
    monthAgo.setDate(today.getDate() - 30)
    const startDate = monthAgo.toISOString().split('T')[0]
    const endDate   = today.toISOString().split('T')[0]

    const allRows: ScorecardRow[] = []

    await Promise.allSettled(
      clients.map(async c => {
        const fetches: Promise<void>[] = []

        if (c.meta_ads_account_id) {
          fetches.push(
            fetch(`/api/ads/meta?account_id=${c.meta_ads_account_id}&date_range=last_30d&start_date=${startDate}&end_date=${endDate}`)
              .then(r => r.json())
              .then(data => {
                for (const cam of data.campaigns ?? []) {
                  allRows.push({
                    clientId:     c.id,
                    clientName:   c.business_name,
                    campaignId:   cam.id,
                    campaignName: cam.name,
                    platform:     'meta',
                    budget:       cam.daily_budget ? Number(cam.daily_budget) * 30 : null,
                    daysToEnd:    null,
                    leads:        Number(cam.leads ?? 0),
                    leadType:     cam.objective ?? '',
                    cpl:          Number(cam.cpl ?? 0),
                    ctr:          Number(cam.ctr ?? 0),
                    impressions:  Number(cam.impressions ?? 0),
                    clicks:       Number(cam.clicks ?? 0),
                    spend:        Number(cam.spend ?? 0),
                    crmContacts:  0,
                  })
                }
              })
              .catch(() => {})
          )
        }

        if (c.google_ads_customer_id) {
          fetches.push(
            fetch(`/api/ads/google?customer_id=${c.google_ads_customer_id}&date_range=last_30d&start_date=${startDate}&end_date=${endDate}`)
              .then(r => r.json())
              .then(data => {
                for (const cam of data.campaigns ?? []) {
                  const spend = Number(cam.spend ?? (Number(cam.cost_micros ?? 0) / 1_000_000))
                  allRows.push({
                    clientId:     c.id,
                    clientName:   c.business_name,
                    campaignId:   cam.id,
                    campaignName: cam.name,
                    platform:     'google',
                    budget:       cam.budget ? Number(cam.budget) : null,
                    daysToEnd:    null,
                    leads:        Number(cam.leads ?? cam.conversions ?? 0),
                    leadType:     cam.advertising_channel_type ?? '',
                    cpl:          Number(cam.cpl ?? 0),
                    ctr:          Number(cam.ctr ?? 0),
                    impressions:  Number(cam.impressions ?? 0),
                    clicks:       Number(cam.clicks ?? 0),
                    spend,
                    crmContacts:  0,
                  })
                }
              })
              .catch(() => {})
          )
        }

        await Promise.allSettled(fetches)
      })
    )

    setRows(allRows)
    setLastRefresh(new Date())
    setRefreshTick(t => t + 1)
    setLoading(false)
  }, [clients])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Build alerts per client
  const alerts: ClientBudgetAlert[] = useMemo(() => {
    const byClient = new Map<string, ScorecardRow[]>()
    for (const r of rows) {
      if (!byClient.has(r.clientId)) byClient.set(r.clientId, [])
      byClient.get(r.clientId)!.push(r)
    }
    // Also include clients with no rows but with connected platforms
    for (const c of clients) {
      if (!byClient.has(c.id) && (c.meta_ads_account_id || c.google_ads_customer_id)) {
        byClient.set(c.id, [])
      }
    }
    return Array.from(byClient.entries()).map(([clientId, cRows]) => {
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
    if (filter === 'meta')        result = result.filter(a => a.meta_ads)
    if (filter === 'google')      result = result.filter(a => a.google_ads)
    if (filter === 'critical')    result = result.filter(a => getOverallStatus(a) === 'critical')
    if (filter === 'attention')   result = result.filter(a => getOverallStatus(a) === 'attention')
    if (filter === 'subdelivery') result = result.filter(a => getOverallStatus(a) === 'subdelivery')
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(a => a.clientName.toLowerCase().includes(q))
    }
    result.sort((a, b) =>
      STATUS_ORDER.indexOf(getOverallStatus(a)) - STATUS_ORDER.indexOf(getOverallStatus(b))
    )
    return result
  }, [alerts, filter, search])

  const criticalCount    = alerts.filter(a => getOverallStatus(a) === 'critical').length
  const attentionCount   = alerts.filter(a => getOverallStatus(a) === 'attention').length
  const subdeliveryCount = alerts.filter(a => getOverallStatus(a) === 'subdelivery').length
  const activeAlerts     = criticalCount + attentionCount + subdeliveryCount

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
            activeAlerts > 0 ? 'bg-red-500/10' : 'bg-muted'
          )}>
            <ShieldAlert className={cn('h-5 w-5', activeAlerts > 0 ? 'text-red-400' : 'text-muted-foreground')} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Control de saldos</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {activeAlerts === 0
                ? <p className="text-sm text-muted-foreground">Todos los presupuestos en orden</p>
                : (
                  <div className="flex items-center gap-3">
                    {criticalCount > 0 && (
                      <span className="text-xs text-red-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {criticalCount} critica{criticalCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {attentionCount > 0 && (
                      <span className="text-xs text-amber-400 font-semibold">{attentionCount} atencion</span>
                    )}
                    {subdeliveryCount > 0 && (
                      <span className="text-xs text-violet-400 font-semibold">{subdeliveryCount} subdelivery</span>
                    )}
                  </div>
                )
              }
              {lastRefresh && (
                <span className="text-[11px] text-muted-foreground/60">
                  Actualizado {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
            onClick={fetchAll} disabled={loading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all',
              filter === opt.value
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
            )}
          >
            {opt.label}
            {opt.value === 'critical'    && criticalCount > 0    && <span className="ml-1.5 bg-red-500/20 text-red-400 rounded-full px-1.5 text-[10px]">{criticalCount}</span>}
            {opt.value === 'attention'   && attentionCount > 0   && <span className="ml-1.5 bg-amber-500/20 text-amber-400 rounded-full px-1.5 text-[10px]">{attentionCount}</span>}
            {opt.value === 'subdelivery' && subdeliveryCount > 0 && <span className="ml-1.5 bg-violet-500/20 text-violet-400 rounded-full px-1.5 text-[10px]">{subdeliveryCount}</span>}
          </button>
        ))}
      </div>

      {/* Saldo presupuestario Meta */}
      {(() => {
        if (filter === 'google' || filter === 'critical' || filter === 'attention' || filter === 'subdelivery') return null
        const metaClients = clients.filter(c => {
          if (!c.meta_ads_account_id) return false
          if (search.trim() && !c.business_name.toLowerCase().includes(search.toLowerCase())) return false
          return true
        })
        if (metaClients.length === 0) return null
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Saldo presupuestario Meta</h2>
              <span className="text-[11px] text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">Meta Ads</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {metaClients.map(c => (
                <ClientMetaBudgetSection
                  key={c.id}
                  client={c}
                  refreshTrigger={refreshTick}
                />
              ))}
            </div>
          </div>
        )
      })()}

      {/* Saldo presupuestario API — Google Ads account_budget */}
      {(() => {
        if (filter === 'meta' || filter === 'critical' || filter === 'attention' || filter === 'subdelivery') return null
        const googleClients = clients.filter(c => {
          if (!c.google_ads_customer_id) return false
          if (search.trim() && !c.business_name.toLowerCase().includes(search.toLowerCase())) return false
          return true
        })
        if (googleClients.length === 0) return null
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Saldo presupuestario API</h2>
              <span className="text-[11px] text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">Google Ads</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {googleClients.map(c => (
                <ClientAccountBudgetSection
                  key={c.id}
                  client={c}
                  refreshTrigger={refreshTick}
                />
              ))}
            </div>
          </div>
        )
      })()}

      {/* Alertas de presupuesto por campaña */}
      {/* Alertas de presupuesto por campaña */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Alertas por campaña</h2>
          {filtered.length > 0 && (
            <span className="text-[11px] text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">
              {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 p-4 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {search ? `Sin resultados para "${search}"` : 'No hay alertas activas'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Todos los presupuestos estan dentro de parametros normales.
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
    </div>
  )
}
