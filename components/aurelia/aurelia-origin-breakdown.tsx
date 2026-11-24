'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { isInternalAccount, type AureliaClient, type DateRange } from '@/lib/aurelia/metrics'
import { groupOrigins } from '@/lib/aurelia/origins-shared'
import { useAureliaOrigins } from './use-aurelia-origins'

const inRange = (value: string | null, range: DateRange) => {
  if (!value) return false
  const time = new Date(value).getTime()
  return time >= range.start.getTime() && time < range.end.getTime()
}

/** Altas del período agrupadas por el canal del referral (y sus campañas). */
export function AureliaOriginBreakdown({ clients, range, periodLabel }: { clients: AureliaClient[]; range: DateRange; periodLabel: string }) {
  const { data, isLoading } = useAureliaOrigins()

  const sales = useMemo(() => clients.filter((client) => inRange(client.startedAt, range) && !isInternalAccount(client)), [clients, range])
  const groups = useMemo(() => (data?.available ? groupOrigins(sales.map((client) => client.id), data.origins) : []), [data, sales])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Origen de las ventas</CardTitle>
        <CardDescription>Altas · {periodLabel} · referral del CRM y atribución de GoHighLevel</CardDescription>
        {data?.available && data.ghl.error && <p className="text-xs text-destructive">No se pudo leer GoHighLevel: {data.ghl.error}. Se muestra solo el CRM.</p>}
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <div className="flex flex-col gap-4" aria-label="Cargando origen">
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        ) : data && !data.available ? (
          <p className="py-6 text-center text-sm text-muted-foreground text-pretty">{data.message}</p>
        ) : sales.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sin altas en el período.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {groups.map((group) => {
              const share = group.count / sales.length
              return (
                <li key={group.channel} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{group.channel}</span>
                    <span className="shrink-0 tabular-nums">{group.count.toLocaleString('es-AR')}</span>
                  </div>
                  <Progress value={share * 100} className="h-1.5" aria-label={`${group.channel}: ${Math.round(share * 100)}% de las altas`} />
                  {group.campaigns.length > 0 ? (
                    <ul className="flex flex-col gap-0.5">
                      {group.campaigns.slice(0, 3).map((campaign) => (
                        <li key={campaign.name} className="flex justify-between gap-3 text-xs text-muted-foreground">
                          <span className="truncate" title={campaign.name}>{campaign.name}</span>
                          <span className="shrink-0 tabular-nums">{campaign.count}</span>
                        </li>
                      ))}
                      {group.campaigns.length > 3 && <li className="text-xs text-muted-foreground">+{group.campaigns.length - 3} campañas más</li>}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground tabular-nums">{Math.round(share * 100)}% de las altas</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
