'use client'

import type { DashboardKPIs } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, DollarSign, Target, Calculator, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface KPICardsProps {
  kpis: DashboardKPIs
  loading?: boolean
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toLocaleString('es-AR')
}

function TrendIndicator({ value, suffix = '', invertPositive = false }: {
  value: number
  suffix?: string
  invertPositive?: boolean
}) {
  if (value === 0) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        <Minus className="h-3 w-3" />
        Estable
      </span>
    )
  }
  const rawPositive = value > 0
  const isGood = invertPositive ? !rawPositive : rawPositive
  const Icon = rawPositive ? TrendingUp : TrendingDown
  return (
    <span className={cn('flex items-center gap-1 text-xs font-medium', isGood ? 'text-status-verde' : 'text-status-rojo')}>
      <Icon className="h-3 w-3" />
      {rawPositive ? '+' : ''}{value.toFixed(1)}{suffix} vs anterior
    </span>
  )
}

function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map(i => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="pt-5 pb-5">
            <div className="animate-pulse space-y-3">
              <div className="h-3.5 w-24 bg-muted rounded-full" />
              <div className="h-9 w-28 bg-muted rounded-lg" />
              <div className="h-3 w-36 bg-muted rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface KPICardProps {
  label: string
  value: string
  trend: number
  trendSuffix?: string
  invertPositive?: boolean
  icon: React.ReactNode
  iconBg: string
  accentBar: string
}

function KPICard({ label, value, trend, trendSuffix = '%', invertPositive = false, icon, iconBg, accentBar }: KPICardProps) {
  return (
    <Card className="overflow-hidden relative group card-hover border-border/60">
      <div className={cn('h-0.5 w-full absolute top-0 left-0', accentBar)} />
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-4">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-bold tracking-tight text-foreground mb-2">{value}</p>
        <TrendIndicator value={trend} suffix={trendSuffix} invertPositive={invertPositive} />
      </CardContent>
    </Card>
  )
}

export function KPICards({ kpis, loading }: KPICardsProps) {
  if (loading) return <KPISkeleton />

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        label="Inversion total"
        value={formatCurrency(kpis.totalInvestment)}
        trend={kpis.investmentChange}
        icon={<DollarSign className="h-4 w-4 text-primary" />}
        iconBg="bg-primary/10 dark:bg-primary/15"
        accentBar="bg-primary"
      />
      <KPICard
        label="Leads totales"
        value={formatNumber(kpis.leads)}
        trend={kpis.leadsChange}
        icon={<Target className="h-4 w-4 text-status-verde" />}
        iconBg="bg-status-verde/10 dark:bg-status-verde/15"
        accentBar="bg-status-verde"
      />
      <KPICard
        label="CPL promedio"
        value={formatCurrency(kpis.cpl)}
        trend={kpis.cplChange}
        invertPositive
        icon={<Calculator className="h-4 w-4 text-status-amarillo" />}
        iconBg="bg-status-amarillo/10 dark:bg-status-amarillo/15"
        accentBar="bg-status-amarillo"
      />
      <Link href="/dashboard/crm" className="block">
        <Card className="overflow-hidden relative border-border/60 hover:border-primary/50 transition-colors cursor-pointer group">
          <div className="h-0.5 w-full absolute top-0 left-0 bg-violet-500" />
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between mb-4">
              <p className="text-sm text-muted-foreground font-medium">CRM</p>
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-violet-500/10 dark:bg-violet-500/15">
                <Users className="h-4 w-4 text-violet-400" />
              </div>
            </div>
            <p className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">Ver oportunidades y contactos</p>
            <span className="text-xs text-muted-foreground">Ir al panel de CRM</span>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
