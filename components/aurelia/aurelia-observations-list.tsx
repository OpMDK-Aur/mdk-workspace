'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeName } from '@/lib/aurelia/onboarding-shared'
import { formatDay, type OnboardingObservation } from '@/lib/aurelia/followup-shared'

export function AureliaObservationsList({ observations, onOpenClient }: { observations: OnboardingObservation[]; onOpenClient: (clientId: string, clientName: string) => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const groups = useMemo(() => {
    const query = normalizeName(deferredSearch)
    const filtered = observations.filter((observation) =>
      (!from || observation.fecha >= from)
      && (!to || observation.fecha <= to)
      && (!query || normalizeName(`${observation.clientName ?? ''} ${observation.comentario} ${observation.autorName ?? ''}`).includes(query)))
    const byDate = new Map<string, OnboardingObservation[]>()
    for (const observation of filtered) byDate.set(observation.fecha, [...(byDate.get(observation.fecha) ?? []), observation])
    return { total: filtered.length, entries: [...byDate.entries()] }
  }, [observations, from, to, deferredSearch])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente o texto" className="pl-9" aria-label="Buscar en observaciones" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="observaciones-desde" className="text-xs text-muted-foreground">Desde</Label>
          <Input id="observaciones-desde" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="observaciones-hasta" className="text-xs text-muted-foreground">Hasta</Label>
          <Input id="observaciones-hasta" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="h-9 w-40" />
        </div>
        {(from || to || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setSearch('') }}>Limpiar filtros</Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{groups.total} observaciones</span>
      </div>

      {groups.entries.length === 0 ? (
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
          {observations.length === 0 ? 'Todavía no hay observaciones. Abrí un cliente para cargar la primera.' : 'Ninguna observación coincide con los filtros.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-5">
          {groups.entries.map(([fecha, items]) => (
            <li key={fecha} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatDay(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h4>
              <ul className="flex flex-col divide-y rounded-lg border">
                {items.map((observation) => (
                  <li key={observation.id} className="flex flex-col gap-1 p-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <button type="button" onClick={() => onOpenClient(observation.clientId, observation.clientName ?? 'Cliente')} className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {observation.clientName ?? 'Cliente'}
                      </button>
                      {observation.autorName && <span className="text-xs text-muted-foreground">{observation.autorName}</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-pretty">{observation.comentario}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
