'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import type { Client } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ShieldAlert, Search, RefreshCw, AlertTriangle, TrendingDown, HelpCircle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { AccountBudgetResult } from '@/app/api/ads/google/account-budget/route'
import type { MetaAccountBudgetResult } from '@/app/api/ads/meta/account-budget/route'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SaldosContentProps {
  clients: Pick<Client, 'id' | 'business_name' | 'meta_ads_account_id' | 'google_ads_customer_id' | 'status'>[]
}

type FilterOption = 'all' | 'meta' | 'google' | 'critical'

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'all',      label: 'Todos' },
  { value: 'meta',     label: 'Meta Ads' },
  { value: 'google',   label: 'Google Ads' },
  { value: 'critical', label: 'Critico' },
]

// ── Number formatter — full number, 2 decimals, thousands separator ───────────
function formatAmount(value: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// ── Budget Card State ──────────────────────────────────────────────────────────
type BudgetFetchState = 'idle' | 'loading' | 'done' | 'error' | 'token_expired'

// ── Google Ads Account Budget Card ─────────────────────────────────────────────
function GoogleAccountBudgetCard({
  customerId,
  clientName,
  refreshTrigger,
  onBalanceResult,
}: {
  customerId: string
  clientName: string
  refreshTrigger: number
  onBalanceResult?: (balance: number | null) => void
}) {
  const [state, setState] = useState<BudgetFetchState>('loading')
  const [data, setData] = useState<AccountBudgetResult | null>(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!customerId) return
    setState('loading')
    setData(null)
    setErrMsg('')
    fetch(`/api/ads/google/account-budget?customer_id=${encodeURIComponent(customerId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          // Check if it's a token expiration error (using tokenExpired flag from API)
          if (json.tokenExpired === true) {
            setState('token_expired')
            onBalanceResult?.(null)
          } else {
            setErrMsg(json.error)
            setState('error')
            onBalanceResult?.(null)
          }
          return
        }
        const result: AccountBudgetResult | null = json.data ?? null
        setData(result)
        onBalanceResult?.(result?.saldoDisponible ?? null)
        setState('done')
      })
      .catch(e => {
        setErrMsg(e.message ?? 'Error desconocido')
        setState('error')
        onBalanceResult?.(null)
      })
  }, [customerId, refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCritical = data && data.saldoDisponible <= 0
  const hasSpendCap = data && (data.limiteAjustado > 0 || data.limiteAprobado > 0)
  const pctUsed = hasSpendCap
    ? (data.montoServido / (data.limiteAjustado > 0 ? data.limiteAjustado : data.limiteAprobado)) * 100
    : null

  // Token expired state
  if (state === 'token_expired') {
    return (
      <Card className="overflow-hidden relative border-l-4 border-l-orange-500 border-border/60">
        <CardContent className="pt-5 pb-5">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium">{clientName}</p>
            <p className="text-sm text-orange-400 font-medium">
              Token vencido — re-autoriza Google OAuth desde Plataformas
            </p>
            <Link href="/dashboard/platforms">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
                <ExternalLink className="h-3.5 w-3.5" />
                Ir a Plataformas
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      'overflow-hidden relative border',
      isCritical ? 'border-l-4 border-l-red-500 border-red-500/40 bg-red-500/5' : 'border-border/60'
    )}>
      <CardContent className="pt-5 pb-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium mb-1">{clientName}</p>
              <p className="text-sm font-semibold text-foreground truncate">
                {data?.accountName || 'Saldo presupuestario'}
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
                  Este valor representa el saldo presupuestario calculado desde Google Ads como limite ajustado menos monto servido.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {isCritical && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-[#fef2f2] text-[#991b1b]">
              <TrendingDown className="h-3 w-3" />
              Saldo agotado
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
          <p className="text-sm text-destructive leading-snug">
            No se pudo obtener el saldo presupuestario. <span className="text-muted-foreground">{errMsg}</span>
          </p>
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
                isCritical ? 'text-red-500' : 'text-foreground'
              )}>
                {isCritical ? '$0,00' : formatAmount(data.saldoDisponible)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Disponible (limite ajustado - monto servido)</p>
            </div>

            {/* Progress bar — only when spend_cap > 0 and not critical */}
            {!isCritical && hasSpendCap && pctUsed !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Consumo</span>
                  <span>{pctUsed.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all bg-blue-500"
                    style={{ width: `${Math.min(pctUsed, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* No spend cap message */}
            {!hasSpendCap && !isCritical && (
              <p className="text-xs text-muted-foreground">Sin spend cap configurado</p>
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

// ── Google multi-account selector ──────────────────────────────────────────────
function ClientGoogleBudgetSection({
  client,
  refreshTrigger,
  onBalanceResult,
}: {
  client: Pick<Client, 'id' | 'business_name' | 'google_ads_customer_id'>
  refreshTrigger: number
  onBalanceResult?: (clientId: string, balance: number | null) => void
}) {
  const accountIds = (client.google_ads_customer_id ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const [selectedId, setSelectedId] = useState(accountIds[0] ?? '')

  useEffect(() => {
    if (accountIds.length > 0 && !accountIds.includes(selectedId)) {
      setSelectedId(accountIds[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.google_ads_customer_id])

  if (accountIds.length === 0) return null

  return (
    <div className="space-y-1.5">
      {accountIds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {accountIds.map(id => (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] transition-all font-mono',
                selectedId === id
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
              )}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      <GoogleAccountBudgetCard
        customerId={selectedId}
        clientName={client.business_name}
        refreshTrigger={refreshTrigger}
        onBalanceResult={(balance) => onBalanceResult?.(client.id, balance)}
      />
    </div>
  )
}

// ── Meta Account Budget Card ───────────────────────────────────────────────────
function MetaAccountBudgetCard({
  accountId,
  clientName,
  refreshTrigger,
  onBalanceResult,
}: {
  accountId: string
  clientName: string
  refreshTrigger: number
  onBalanceResult?: (balance: number | null) => void
}) {
  const [state, setState] = useState<BudgetFetchState>('loading')
  const [data, setData] = useState<MetaAccountBudgetResult | null>(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!accountId) return
    setState('loading')
    setData(null)
    setErrMsg('')
    fetch(`/api/ads/meta/account-budget?account_id=${encodeURIComponent(accountId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setErrMsg(json.error)
          setState('error')
          onBalanceResult?.(null)
          return
        }
        const result: MetaAccountBudgetResult | null = json.data ?? null
        setData(result)
        onBalanceResult?.(result?.saldoPresupuestario ?? null)
        setState('done')
      })
      .catch(e => {
        setErrMsg(e.message ?? 'Error desconocido')
        setState('error')
        onBalanceResult?.(null)
      })
  }, [accountId, refreshTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCritical = data?.hasSpendCap && (data.saldoPresupuestario ?? 1) <= 0
  const pctUsed = data?.hasSpendCap && data.spendCap > 0
    ? (data.amountSpent / data.spendCap) * 100
    : null

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
      isCritical ? 'border-l-4 border-l-red-500 border-red-500/40 bg-red-500/5' : 'border-border/60'
    )}>
      <CardContent className="pt-5 pb-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium mb-1">{clientName}</p>
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
                    Se calcula como spend cap menos amount spent. No equivale al balance contable de Meta.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {data?.adAccountName && (
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">ID: act_{accountId}</p>
            )}
          </div>
          {isCritical && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-[#fef2f2] text-[#991b1b]">
              <TrendingDown className="h-3 w-3" />
              Saldo agotado
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
                  isCritical ? 'text-red-500' : 'text-foreground'
                )}>
                  {isCritical ? '$0,00' : fmt(data.saldoPresupuestario!)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Disponible (spend cap - amount spent)</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin spend cap configurado</p>
            )}

            {/* Progress bar — only when spend_cap exists and not critical */}
            {!isCritical && data.hasSpendCap && pctUsed !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Consumo</span>
                  <span>{pctUsed.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all bg-blue-400"
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
  onBalanceResult,
}: {
  client: Pick<Client, 'id' | 'business_name' | 'meta_ads_account_id'>
  refreshTrigger: number
  onBalanceResult?: (clientId: string, balance: number | null) => void
}) {
  const accountIds = (client.meta_ads_account_id ?? '')
    .split(',')
    .map(s => s.trim().replace(/^act_/, ''))
    .filter(Boolean)

  const [selectedId, setSelectedId] = useState(accountIds[0] ?? '')

  useEffect(() => {
    if (accountIds.length > 0 && !accountIds.includes(selectedId)) {
      setSelectedId(accountIds[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.meta_ads_account_id])

  if (accountIds.length === 0) return null

  return (
    <div className="space-y-1.5">
      {accountIds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {accountIds.map(id => (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] transition-all font-mono',
                selectedId === id
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
              )}
            >
              act_{id}
            </button>
          ))}
        </div>
      )}

      <MetaAccountBudgetCard
        accountId={selectedId}
        clientName={client.business_name}
        refreshTrigger={refreshTrigger}
        onBalanceResult={(balance) => onBalanceResult?.(client.id, balance)}
      />
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function SaldosContent({ clients }: SaldosContentProps) {
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterOption>('all')
  const [search, setSearch] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [balances, setBalances] = useState<Record<string, number | null>>({})

  // Track balances from cards to determine critical state
  const handleBalanceResult = useCallback((clientId: string, balance: number | null) => {
    setBalances(prev => ({ ...prev, [clientId]: balance }))
  }, [])

  // Initial load delay
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500)
    return () => clearTimeout(timer)
  }, [])

  const handleRefresh = () => {
    setLoading(true)
    setRefreshTick(t => t + 1)
    setTimeout(() => setLoading(false), 1500)
  }

  // Filter clients
  const metaClients = useMemo(() => {
    return clients.filter(c => {
      if (!c.meta_ads_account_id) return false
      if (search.trim() && !c.business_name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [clients, search])

  const googleClients = useMemo(() => {
    return clients.filter(c => {
      if (!c.google_ads_customer_id) return false
      if (search.trim() && !c.business_name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [clients, search])

  // Critical clients are those with balance <= 0
  const criticalCount = useMemo(() => {
    return Object.values(balances).filter(b => b !== null && b <= 0).length
  }, [balances])

  // For critical filter, we need to track which clients are critical
  const criticalClientIds = useMemo(() => {
    return Object.entries(balances)
      .filter(([_, b]) => b !== null && b <= 0)
      .map(([id]) => id)
  }, [balances])

  const criticalMetaClients = metaClients.filter(c => criticalClientIds.includes(c.id))
  const criticalGoogleClients = googleClients.filter(c => criticalClientIds.includes(c.id))

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
            criticalCount > 0 ? 'bg-red-500/10' : 'bg-muted'
          )}>
            <ShieldAlert className={cn('h-5 w-5', criticalCount > 0 ? 'text-red-400' : 'text-muted-foreground')} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Control de saldos</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {criticalCount === 0
                ? <p className="text-sm text-muted-foreground">Todos los presupuestos en orden</p>
                : (
                  <span className="text-xs text-red-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {criticalCount} critico{criticalCount !== 1 ? 's' : ''}
                  </span>
                )
              }
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
            onClick={handleRefresh} disabled={loading}
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
            {opt.value === 'critical' && criticalCount > 0 && (
              <span className="ml-1.5 bg-red-500/20 text-red-400 rounded-full px-1.5 text-[10px]">{criticalCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content based on filter */}
      {filter === 'all' && (
        <>
          {/* Meta Ads Section */}
          {metaClients.length > 0 && (
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
                    onBalanceResult={handleBalanceResult}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Google Ads Section */}
          {googleClients.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Saldo presupuestario Google Ads</h2>
                <span className="text-[11px] text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">Google Ads</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {googleClients.map(c => (
                  <ClientGoogleBudgetSection
                    key={c.id}
                    client={c}
                    refreshTrigger={refreshTick}
                    onBalanceResult={handleBalanceResult}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {filter === 'meta' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Saldo presupuestario Meta</h2>
            <span className="text-[11px] text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">Meta Ads</span>
          </div>
          {metaClients.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                  <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No hay clientes con Meta Ads configurado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {metaClients.map(c => (
                <ClientMetaBudgetSection
                  key={c.id}
                  client={c}
                  refreshTrigger={refreshTick}
                  onBalanceResult={handleBalanceResult}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {filter === 'google' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Saldo presupuestario Google Ads</h2>
            <span className="text-[11px] text-muted-foreground border border-border/50 rounded-full px-2 py-0.5">Google Ads</span>
          </div>
          {googleClients.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                  <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No hay clientes con Google Ads configurado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {googleClients.map(c => (
                <ClientGoogleBudgetSection
                  key={c.id}
                  client={c}
                  refreshTrigger={refreshTick}
                  onBalanceResult={handleBalanceResult}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {filter === 'critical' && (
        <div className="space-y-6">
          {criticalCount === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                  <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No hay clientes criticos</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Todos los presupuestos tienen saldo disponible.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {criticalMetaClients.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Saldo presupuestario Meta</h2>
                    <span className="text-[11px] text-red-400 border border-red-500/40 rounded-full px-2 py-0.5">Critico</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {criticalMetaClients.map(c => (
                      <ClientMetaBudgetSection
                        key={c.id}
                        client={c}
                        refreshTrigger={refreshTick}
                        onBalanceResult={handleBalanceResult}
                      />
                    ))}
                  </div>
                </div>
              )}

              {criticalGoogleClients.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Saldo presupuestario Google Ads</h2>
                    <span className="text-[11px] text-red-400 border border-red-500/40 rounded-full px-2 py-0.5">Critico</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {criticalGoogleClients.map(c => (
                      <ClientGoogleBudgetSection
                        key={c.id}
                        client={c}
                        refreshTrigger={refreshTick}
                        onBalanceResult={handleBalanceResult}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
