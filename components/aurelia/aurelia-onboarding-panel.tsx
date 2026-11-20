'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatDate, isInternalAccount, type AureliaClient } from '@/lib/aurelia/metrics'
import { STALLED_AFTER_DAYS, daysSince, matchOnboarding, normalizeName, type AureliaOnboardingData, type OnboardingMatch } from '@/lib/aurelia/onboarding-shared'

const NO_OPPORTUNITY = '__none__'
const ALL = '__all__'

type Row = { client: AureliaClient; match: OnboardingMatch | null; daysInStage: number | null }

function daysLabel(days: number | null) {
  if (days === null) return '—'
  if (days === 0) return 'Hoy'
  return days === 1 ? '1 día' : `${days} días`
}

export function AureliaOnboardingPanel({ clients, onboarding, onOpenClient }: { clients: AureliaClient[]; onboarding: AureliaOnboardingData; onOpenClient: (client: AureliaClient) => void }) {
  const [stageFilter, setStageFilter] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const [hideUnmatched, setHideUnmatched] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const activeClients = useMemo(() => clients.filter((client) => client.status === 'active' && !isInternalAccount(client)), [clients])

  const view = useMemo(() => {
    if (!onboarding.available) return null
    const { matches } = matchOnboarding(activeClients, onboarding)
    const now = Date.now()
    const rows: Row[] = activeClients
      .map((client) => {
        const match = matches.get(client.id) ?? null
        return { client, match, daysInStage: match ? daysSince(match.stageAt ?? match.updatedAt, now) : null }
      })
      .filter((row) => !hideUnmatched || row.match)
    const counts = new Map<string, number>()
    for (const row of rows) {
      const key = row.match?.stage?.id ?? NO_OPPORTUNITY
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return { rows, counts, stalled: rows.filter((row) => (row.daysInStage ?? 0) >= STALLED_AFTER_DAYS).length }
  }, [activeClients, onboarding, hideUnmatched])

  const filteredRows = useMemo(() => {
    if (!view) return []
    const query = normalizeName(deferredSearch)
    return view.rows
      .filter((row) => stageFilter === ALL || (row.match?.stage?.id ?? NO_OPPORTUNITY) === stageFilter)
      .filter((row) => !query || normalizeName(`${row.client.name} ${row.client.email ?? ''} ${row.match?.title ?? ''}`).includes(query))
      .sort((a, b) => (a.match?.stage?.position ?? Number.MAX_SAFE_INTEGER) - (b.match?.stage?.position ?? Number.MAX_SAFE_INTEGER) || (b.daysInStage ?? -1) - (a.daysInStage ?? -1))
  }, [view, stageFilter, deferredSearch])

  if (!onboarding.available || !view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Onboarding de clientes activos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="size-4" aria-hidden="true" />{onboarding.available ? 'Sin datos.' : onboarding.message}</p>
        </CardContent>
      </Card>
    )
  }

  const total = view.rows.length
  const segments = [
    ...onboarding.stages.map((stage) => ({ id: stage.id, name: stage.name, count: view.counts.get(stage.id) ?? 0 })),
    ...(hideUnmatched ? [] : [{ id: NO_OPPORTUNITY, name: 'Sin oportunidad', count: view.counts.get(NO_OPPORTUNITY) ?? 0 }]),
  ]
  const lastStageIndex = onboarding.stages.length - 1

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle className="text-base font-medium">Onboarding de clientes activos</CardTitle>
        <CardDescription className="text-pretty">
          {total} clientes activos · etapa de su oportunidad en el pipeline {onboarding.pipelineName}
          {view.stalled > 0 && <> · <span className="font-medium text-chart-4">{view.stalled} con más de {STALLED_AFTER_DAYS} días en la misma etapa</span></>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {segments.filter((segment) => segment.count > 0).map((segment) => {
              const index = onboarding.stages.findIndex((stage) => stage.id === segment.id)
              return (
                <div
                  key={segment.id}
                  className={cn('h-full border-r border-card last:border-r-0', segment.id === NO_OPPORTUNITY ? 'bg-muted-foreground/30' : 'bg-primary')}
                  style={{ width: `${(segment.count / Math.max(total, 1)) * 100}%`, opacity: segment.id === NO_OPPORTUNITY ? 1 : 0.35 + (0.65 * (index + 1)) / Math.max(lastStageIndex + 1, 1) }}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por etapa">
            <StageChip label="Todas" count={total} active={stageFilter === ALL} onClick={() => setStageFilter(ALL)} />
            {segments.map((segment) => (
              <StageChip key={segment.id} label={segment.name} count={segment.count} muted={segment.id === NO_OPPORTUNITY} active={stageFilter === segment.id} onClick={() => setStageFilter(stageFilter === segment.id ? ALL : segment.id)} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente u oportunidad" className="pl-9" aria-label="Buscar cliente u oportunidad" />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="onboarding-hide-unmatched"
              checked={hideUnmatched}
              onCheckedChange={(checked) => {
                setHideUnmatched(checked)
                if (checked && stageFilter === NO_OPPORTUNITY) setStageFilter(ALL)
              }}
            />
            <Label htmlFor="onboarding-hide-unmatched" className="text-xs">Ocultar sin oportunidad</Label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>En la etapa</TableHead>
                <TableHead>Oportunidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Ningún cliente coincide con los filtros.</TableCell>
                </TableRow>
              ) : filteredRows.map(({ client, match, daysInStage }) => {
                const stalled = (daysInStage ?? 0) >= STALLED_AFTER_DAYS
                return (
                  <TableRow key={client.id} className="cursor-pointer" onClick={() => onOpenClient(client)}>
                    <TableCell>
                      <button type="button" className="flex flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); onOpenClient(client) }}>
                        <span className="font-medium text-foreground">{client.name}</span>
                        {client.email && <span className="text-xs text-muted-foreground">{client.email}</span>}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{client.planName ?? '—'}</TableCell>
                    <TableCell>
                      {match?.stage ? (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">{match.stage.name}</Badge>
                      ) : match ? (
                        <Badge variant="outline" className="font-normal text-muted-foreground">Etapa desconocida</Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal text-muted-foreground">Sin oportunidad</Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn('whitespace-nowrap text-sm', stalled ? 'font-medium text-chart-4' : 'text-muted-foreground')}>
                      {daysLabel(daysInStage)}
                      {match?.stageAt && <span className="block text-xs font-normal text-muted-foreground">desde {formatDate(match.stageAt)}</span>}
                    </TableCell>
                    <TableCell className="max-w-56 text-sm">
                      {match ? (
                        <span className="flex flex-col">
                          <span className="truncate">{match.title}</span>
                          <span className="text-xs text-muted-foreground">{match.matchedBy === 'name' ? 'Asociada por nombre' : match.matchedBy === 'email' ? 'Asociada por email' : 'Asociada por teléfono'}</span>
                        </span>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function StageChip({ label, count, active, muted, onClick }: { label: string; count: number; active: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
        muted && !active && 'text-muted-foreground',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}
