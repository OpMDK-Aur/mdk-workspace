import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type AssignedClient = {
  id: string
  name: string
  assignments: Array<{ key: string; label: string; assigned: boolean; needsConnector?: string | null }>
}

export function AdAccountsShortcut({ clients }: { clients: AssignedClient[] }) {
  const pending = clients.filter((client) => client.assignments.some((item) => !item.assigned))

  return (
    <section aria-labelledby="ad-accounts-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="ad-accounts-title" className="text-lg font-semibold text-foreground">Cuentas publicitarias</h2>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            {clients.length === 0
              ? 'No tenés clientes asignados como project o account manager.'
              : pending.length === 0
                ? 'Tus clientes ya tienen todas sus cuentas asignadas.'
                : `${pending.length} de tus ${clients.length} clientes tienen cuentas sin asignar.`}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/dashboard/platform">
            Ver todas las cuentas
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {clients.length > 0 && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {[...pending, ...clients.filter((client) => !pending.includes(client))].map((client) => {
            const missing = client.assignments.filter((item) => !item.assigned)
            return (
              <li key={client.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{client.name}</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label={`Cuentas de ${client.name}`}>
                    {client.assignments.map((item) => (
                      <li key={item.key} className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs', item.assigned ? 'border-border text-muted-foreground' : 'border-primary/30 bg-primary/5 text-foreground')}>
                        <span aria-hidden="true" className={cn('size-1.5 rounded-full', item.assigned ? 'bg-muted-foreground/50' : 'bg-primary')} />
                        {item.label}
                        <span className="sr-only">{item.assigned ? ': asignada' : ': sin asignar'}</span>
                      </li>
                    ))}
                  </ul>
                  {missing.some((item) => item.needsConnector) && (
                    <p className="text-xs text-muted-foreground">
                      {'Para asignar '}
                      {missing.filter((item) => item.needsConnector).map((item) => item.label).join(', ')}
                      {' primero conectá tu cuenta arriba.'}
                    </p>
                  )}
                </div>
                {missing.length > 0 ? (
                  <Button asChild size="sm" className="self-start md:self-auto">
                    <Link href={`/dashboard/platform?cliente=${encodeURIComponent(client.id)}`}>Asignar cuentas</Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="ghost" className="self-start text-muted-foreground md:self-auto">
                    <Link href={`/dashboard/platform?cliente=${encodeURIComponent(client.id)}`}>Revisar</Link>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
