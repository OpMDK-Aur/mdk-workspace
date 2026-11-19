'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { STATUS_LABELS, formatDate, formatMoney, type AureliaClient, type SubscriptionStatus } from '@/lib/aurelia/metrics'

const PAGE_SIZE = 25
type StatusFilter = 'all' | SubscriptionStatus

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  active: 'border-chart-2/30 bg-chart-2/10 text-chart-2',
  trial: 'border-primary/30 bg-primary/10 text-primary',
  past_due: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  churned: 'border-destructive/30 bg-destructive/10 text-destructive',
  other: 'border-border bg-muted text-muted-foreground',
}

const FILTER_ORDER: StatusFilter[] = ['all', 'active', 'trial', 'past_due', 'churned', 'other']

/** `bare` la muestra sin tarjeta y respeta el orden recibido (lo usa el detalle de cada indicador). */
export function AureliaClientsTable({ clients, currency, bare = false }: { clients: AureliaClient[]; currency: string; bare?: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const deferredSearch = useDeferredValue(search)

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: clients.length, active: 0, trial: 0, past_due: 0, churned: 0, other: 0 }
    for (const client of clients) result[client.status] += 1
    return result
  }, [clients])

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase('es-AR')
    const rows = clients
      .filter((client) => status === 'all' || client.status === status)
      .filter((client) => !term || [client.name, client.email, client.phone, client.planName, client.planSlug].some((value) => value?.toLocaleLowerCase('es-AR').includes(term)))
    return bare ? rows : rows.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
  }, [clients, deferredSearch, status, bare])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const searchInput = (
          <div className={cn('relative', !bare && 'md:w-72')}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar por nombre, email, teléfono o plan" className="h-9 pl-8" aria-label="Buscar clientes" />
          </div>
  )
  const statusFilter = (
        <ToggleGroup type="single" size="sm" variant="outline" value={status} onValueChange={(value) => { if (value) { setStatus(value as StatusFilter); setPage(1) } }} className="flex-wrap justify-start" aria-label="Filtrar por estado">
          {FILTER_ORDER.filter((key) => key === 'all' || counts[key] > 0).map((key) => (
            <ToggleGroupItem key={key} value={key} className="gap-1.5 px-3 text-xs">
              {key === 'all' ? 'Todos' : STATUS_LABELS[key]}
              <span className="tabular-nums text-muted-foreground">{counts[key].toLocaleString('es-AR')}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
  )
  const tableAndPager = (
      <>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead>Período actual</TableHead>
                <TableHead>Fin de prueba</TableHead>
                <TableHead>Baja</TableHead>
                <TableHead className="text-right">MRR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">Ningún cliente coincide con los filtros.</TableCell>
                </TableRow>
              ) : visible.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="max-w-64">
                    <div className="flex flex-col">
                      <span className="truncate font-medium">{client.name}</span>
                      {client.email && <span className="truncate text-xs text-muted-foreground">{client.email}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{client.phone || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{client.planName ?? client.planSlug ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', STATUS_STYLES[client.status])} title={client.rawStatus ?? undefined}>
                      {client.status === 'other' && client.rawStatus ? client.rawStatus : STATUS_LABELS[client.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(client.startedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatDate(client.currentPeriodStart)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatDate(client.trialEndAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatDate(client.churnedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums">{client.mrr ? formatMoney(client.mrr, currency) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">
            {filtered.length === 0 ? '0 clientes' : `${((currentPage - 1) * PAGE_SIZE + 1).toLocaleString('es-AR')}–${Math.min(currentPage * PAGE_SIZE, filtered.length).toLocaleString('es-AR')} de ${filtered.length.toLocaleString('es-AR')}`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 tabular-nums">{currentPage} / {pageCount}</span>
            <Button variant="outline" size="icon" className="size-8" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Página siguiente">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </>
  )

  if (bare) {
    return (
      <div className="flex flex-col gap-4">
        {searchInput}
        {statusFilter}
        {tableAndPager}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base font-medium">Clientes del CRM</CardTitle>
          {searchInput}
        </div>
        {statusFilter}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{tableAndPager}</CardContent>
    </Card>
  )
}
