import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatMoney, type PlanBreakdownRow } from '@/lib/aurelia/metrics'

export function AureliaPlanBreakdown({ rows, totalMrr, currency }: { rows: PlanBreakdownRow[]; totalMrr: number; currency: string }) {
  const totalClients = rows.reduce((sum, row) => sum + row.clientes, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">MRR por plan</CardTitle>
        <CardDescription>Cuentas activas o con pago pendiente</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sin cuentas pagando.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => {
              const share = totalMrr > 0 ? row.mrr / totalMrr : totalClients > 0 ? row.clientes / totalClients : 0
              return (
                <li key={row.plan} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{row.plan}</span>
                    <span className="shrink-0 tabular-nums">{formatMoney(row.mrr, currency)}</span>
                  </div>
                  <Progress value={share * 100} className="h-1.5" aria-label={`${row.plan}: ${Math.round(share * 100)}% del MRR`} />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {row.clientes.toLocaleString('es-AR')} {row.clientes === 1 ? 'cuenta' : 'cuentas'} · {Math.round(share * 100)}%
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
