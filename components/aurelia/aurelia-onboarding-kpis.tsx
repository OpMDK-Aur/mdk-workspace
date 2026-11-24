'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { isInternalAccount, type AureliaClient } from '@/lib/aurelia/metrics'
import { useAureliaFollowup } from './use-aurelia-followup'

/** Sobre los clientes activos (sin cuentas internas), igual que el panel de Onboarding en Clientes. */
export function AureliaOnboardingKpis({ clients }: { clients: AureliaClient[] }) {
  const { data, isLoading } = useAureliaFollowup()

  const counts = useMemo(() => {
    if (!data?.available) return null
    const closed = new Set(data.followups.filter((followup) => followup.cierreOnboarding).map((followup) => followup.clientId))
    const active = clients.filter((client) => client.status === 'active' && !isInternalAccount(client))
    const finished = active.filter((client) => closed.has(client.id)).length
    return { inProgress: active.length - finished, finished }
  }, [data, clients])

  const hint = data && !data.available ? data.message : null
  const loading = isLoading && !data

  return (
    <section aria-label="Onboarding" className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
      <OnboardingCard label="En onboarding" value={counts?.inProgress} hint={hint ?? 'activos sin fecha de cierre'} loading={loading} />
      <OnboardingCard label="Onboarding finalizado" value={counts?.finished} hint={hint ?? 'activos con fecha de cierre'} loading={loading} />
    </section>
  )
}

function OnboardingCard({ label, value, hint, loading }: { label: string; value: number | undefined; hint: string; loading: boolean }) {
  return (
    <Link href="/dashboard/aurelia/clientes" className="group h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label}: ${value ?? 'sin datos'}. Ver clientes`}>
      <Card className="h-full gap-0 py-0 transition-colors group-hover:border-primary/50 group-hover:bg-muted/40">
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
          </div>
          {loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-semibold tabular-nums tracking-tight">{value === undefined ? '—' : value.toLocaleString('es-AR')}</p>}
          <p className="truncate text-xs text-muted-foreground" title={hint}>{hint}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
