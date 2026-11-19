'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, Search, Square } from 'lucide-react'
import { formatDuration } from '@/lib/aurelia/time-shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DATE_FIELD_OPTIONS, STATUS_LABELS, formatDate, formatMoney, isDateInRange, isInternalAccount, type AureliaClient, type DateField, type DateRange, type SubscriptionStatus } from '@/lib/aurelia/metrics'

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

export type ClientsTableTime = {
  secondsByClient: Map<string, number>
  runningClientId: string | null
  pending: boolean
  onToggleTimer: (client: AureliaClient) => void
}

/** `bare` la muestra sin tarjeta y respeta el orden recibido (lo usa el detalle de cada indicador). */
export function AureliaClientsTable({ clients, currency, bare = false, time, onOpenClient, range, rangeLabel }: { clients: AureliaClient[]; currency: string; bare?: boolean; time?: ClientsTableTime; onOpenClient?: (client: AureliaClient) => void; range?: DateRange; rangeLabel?: string }) {
  const columnCount = 10 + (time ? 2 : 0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [dateField, setDateField] = useState<DateField | 'none'>('none')
  const [onlyActive, setOnlyActive] = useState(false)
  const [page, setPage] = useState(1)
  const deferredSearch = useDeferredValue(search)

  // Filtrar por fecha usa el mismo período elegido arriba en el tablero.
  const dateFiltered = useMemo(
    () => (dateField === 'none' || !range ? clients : clients.filter((client) => isDateInRange(client[dateField], range))),
    [clients, dateField, range],
  )

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: dateFiltered.length, active: 0, trial: 0, past_due: 0, churned: 0, other: 0 }
    for (const client of dateFiltered) result[client.status] += 1
    return result
  }, [dateFiltered])

  const effectiveStatus: StatusFilter = onlyActive ? 'active' : status

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLocaleLowerCase('es-AR')
    const rows = dateFiltered
      .filter((client) => effectiveStatus === 'all' || client.status === effectiveStatus)
      .filter((client) => !term || [client.name, client.email, client.phone, client.planName, client.planSlug].some((value) => value?.toLocaleLowerCase('es-AR').includes(term)))
    if (bare) return rows
    const sortField: DateField = dateField === 'none' ? 'startedAt' : dateField
    return rows.sort((a, b) => (b[sortField] ?? '').localeCompare(a[sortField] ?? ''))
  }, [dateFiltered, deferredSearch, effectiveStatus, bare, dateField])

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {range && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`${bare ? 'kpi' : 'main'}-date-field`} className="text-xs text-muted-foreground">Fecha</Label>
            <Select value={dateField} onValueChange={(value) => { setDateField(value as DateField | 'none'); setPage(1) }}>
              <SelectTrigger id={`${bare ? 'kpi' : 'main'}-date-field`} className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin filtro de fecha</SelectItem>
                {DATE_FIELD_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {dateField !== 'none' && rangeLabel && <span className="text-xs text-muted-foreground">en {rangeLabel}</span>}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Switch id={`${bare ? 'kpi' : 'main'}-only-active`} checked={onlyActive} onCheckedChange={(checked) => { setOnlyActive(checked); setPage(1) }} />
          <Label htmlFor={`${bare ? 'kpi' : 'main'}-only-active`} className="text-xs">Solo activos</Label>
        </div>
      </div>
      {!onlyActive && (
        <ToggleGroup type="single" size="sm" variant="outline" value={status} onValueChange={(value) => { if (value) { setStatus(value as StatusFilter); setPage(1) } }} className="flex-wrap justify-start" aria-label="Filtrar por estado">
          {FILTER_ORDER.filter((key) => key === 'all' || counts[key] > 0).map((key) => (
            <ToggleGroupItem key={key} value={key} className="min-w-fit flex-none gap-1.5 whitespace-nowrap px-3 text-xs">
              {key === 'all' ? 'Todos' : STATUS_LABELS[key]}
              <span className="tabular-nums text-muted-foreground">{counts[key].toLocaleString('es-AR')}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
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
                <TableHead>Activación</TableHead>
                <TableHead>Período actual</TableHead>
                <TableHead>Fin de prueba</TableHead>
                <TableHead>Baja</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                {time && <TableHead className="text-right">Tiempo</TableHead>}
                {time && <TableHead><span className="sr-only">Medir tiempo</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="py-10 text-center text-sm text-muted-foreground">Ningún cliente coincide con los filtros.</TableCell>
                </TableRow>
              ) : visible.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="max-w-64">
                    {onOpenClient ? (
                      <button type="button" onClick={() => onOpenClient(client)} className="flex max-w-full flex-col rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="truncate font-medium">{client.name}</span>
                        {client.email && <span className="truncate text-xs text-muted-foreground">{client.email}</span>}
                      </button>
                    ) : (
                      <div className="flex flex-col">
                        <span className="truncate font-medium">{client.name}</span>
                        {client.email && <span className="truncate text-xs text-muted-foreground">{client.email}</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{client.phone || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{client.planName ?? client.planSlug ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={cn('whitespace-nowrap font-medium', STATUS_STYLES[client.status])} title={client.rawStatus ?? undefined}>
                        {client.status === 'other' && client.rawStatus ? client.rawStatus : STATUS_LABELS[client.status]}
                      </Badge>
                      {isInternalAccount(client) && <Badge variant="secondary" className="whitespace-nowrap" title="Cuenta propia de Aurelia o MDK: no cuenta como alta">Interna</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(client.startedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(client.activatedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatDate(client.currentPeriodStart)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatDate(client.trialEndAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{formatDate(client.churnedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-medium tabular-nums">{client.mrr ? formatMoney(client.mrr, currency) : '—'}</TableCell>
                  {time && (
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                      {time.secondsByClient.get(client.id) ? formatDuration(time.secondsByClient.get(client.id)!) : '—'}
                    </TableCell>
                  )}
                  {time && (
                    <TableCell className="w-10">
                      <Button
                        size="icon"
                        variant={time.runningClientId === client.id ? 'default' : 'ghost'}
                        className="size-8"
                        disabled={time.pending}
                        onClick={() => time.onToggleTimer(client)}
                        aria-label={time.runningClientId === client.id ? `Detener tiempo en ${client.name}` : `Medir tiempo en ${client.name}`}
                      >
                        {time.runningClientId === client.id ? <Square className="size-3.5 fill-current" /> : <Play className="size-3.5" />}
                      </Button>
                    </TableCell>
                  )}
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
