import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AureliaClient } from '@/lib/aurelia/metrics'
import { formatDuration, type AureliaTimeData } from '@/lib/aurelia/time-shared'

const TOP = 8

export function AureliaTimeSummary({ data, secondsByClient, clients, periodLabel, onOpenClient }: { data: AureliaTimeData | undefined; secondsByClient: Map<string, number>; clients: AureliaClient[]; periodLabel: string; onOpenClient: (client: AureliaClient) => void }) {
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const rows = [...secondsByClient.entries()].filter(([, seconds]) => seconds > 0).sort((a, b) => b[1] - a[1])
  const total = rows.reduce((sum, [, seconds]) => sum + seconds, 0)
  const max = rows[0]?.[1] ?? 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-medium">Tiempo por cliente</CardTitle>
          <CardDescription>{periodLabel} · {rows.length} {rows.length === 1 ? 'cliente' : 'clientes'} con horas</CardDescription>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{formatDuration(total)}</p>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando horas…</p>
        ) : !data.available ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{data.message}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin horas registradas en el período. Abrí un cliente para empezar a medir.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.slice(0, TOP).map(([clientId, seconds]) => {
              const client = clientById.get(clientId)
              const name = client?.name ?? data.entries.find((entry) => entry.clientId === clientId)?.clientName ?? 'Cliente'
              return (
                <li key={clientId}>
                  <button type="button" disabled={!client} onClick={() => client && onOpenClient(client)} className="flex w-full flex-col gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 font-medium tabular-nums">{formatDuration(seconds)}</span>
                    </div>
                    <span className="h-1 rounded-full bg-primary/80" style={{ width: `${Math.max(4, (seconds / max) * 100)}%` }} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
