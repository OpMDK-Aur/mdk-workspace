'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Play, Plus, Square, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { STATUS_LABELS, formatDate, formatMoney, type AureliaClient } from '@/lib/aurelia/metrics'
import { entrySeconds, formatClock, formatDuration, todayInArgentina, type AureliaTimeData } from '@/lib/aurelia/time-shared'
import { useNow, type useAureliaTime } from './use-aurelia-time'

type TimeApi = ReturnType<typeof useAureliaTime>

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}

export function AureliaClientSheet({ client, currency, time, onClose }: { client: AureliaClient | null; currency: string; time: TimeApi; onClose: () => void }) {
  return (
    <Sheet open={client !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {client && <ClientDetail key={client.id} client={client} currency={currency} time={time} />}
      </SheetContent>
    </Sheet>
  )
}

function ClientDetail({ client, currency, time }: { client: AureliaClient; currency: string; time: TimeApi }) {
  const data: AureliaTimeData | undefined = time.data
  const timeAvailable = data?.available === true
  const running = timeAvailable ? data.running : null
  const runningHere = running?.clientId === client.id
  const now = useNow(runningHere)
  const [note, setNote] = useState('')
  const [manual, setManual] = useState({ fecha: todayInArgentina(), hours: '', minutes: '', descripcion: '' })

  const entries = useMemo(() => (timeAvailable ? data.entries.filter((entry) => entry.clientId === client.id) : []), [data, timeAvailable, client.id])
  const monthStart = todayInArgentina().slice(0, 8) + '01'
  const totalSeconds = entries.reduce((sum, entry) => sum + entrySeconds(entry, now), 0)
  const monthSeconds = entries.filter((entry) => entry.fecha >= monthStart).reduce((sum, entry) => sum + entrySeconds(entry, now), 0)

  const submitManual = async (event: FormEvent) => {
    event.preventDefault()
    const minutes = (Number(manual.hours) || 0) * 60 + (Number(manual.minutes) || 0)
    const saved = await time.addManual({ clientId: client.id, clientName: client.name, fecha: manual.fecha, minutes, descripcion: manual.descripcion })
    if (saved) setManual((current) => ({ ...current, hours: '', minutes: '', descripcion: '' }))
  }

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex items-center gap-2">
          <SheetTitle className="truncate">{client.name}</SheetTitle>
          <Badge variant="outline">{STATUS_LABELS[client.status]}</Badge>
        </div>
        <SheetDescription>{[client.email, client.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Plan" value={client.planName ?? client.planSlug ?? '—'} />
          <Field label="MRR" value={client.mrr ? formatMoney(client.mrr, currency) : '—'} />
          <Field label="Alta" value={formatDate(client.startedAt)} />
          <Field label="Período actual" value={formatDate(client.currentPeriodStart)} />
          <Field label="Fin de prueba" value={formatDate(client.trialEndAt)} />
          <Field label="Baja" value={formatDate(client.churnedAt)} />
        </dl>

        <Separator />

        <section aria-labelledby="aurelia-time-title" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h3 id="aurelia-time-title" className="text-sm font-semibold">Tiempo dedicado</h3>
            {timeAvailable && <p className="text-xs text-muted-foreground tabular-nums">Este mes {formatDuration(monthSeconds)} · Total {formatDuration(totalSeconds)}</p>}
          </div>

          {!data ? (
            <p className="text-sm text-muted-foreground">Cargando horas…</p>
          ) : !data.available ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{data.message}</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                {runningHere && running ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="font-mono text-lg tabular-nums">{formatClock(entrySeconds(running, now))}</span>
                      <span className="text-xs text-muted-foreground">{running.descripcion ?? 'Sin descripción'}</span>
                    </div>
                    <Button onClick={() => time.stop()} disabled={time.pending} className="gap-1.5">
                      <Square className="size-3.5 fill-current" aria-hidden="true" />
                      Detener
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="¿En qué vas a trabajar?" aria-label="Descripción del trabajo" maxLength={500} />
                    <Button onClick={async () => { if (await time.start(client.id, client.name, note)) setNote('') }} disabled={time.pending} className="shrink-0 gap-1.5">
                      <Play className="size-3.5 fill-current" aria-hidden="true" />
                      {running ? 'Cambiar a este cliente' : 'Iniciar'}
                    </Button>
                  </div>
                )}
              </div>

              <form onSubmit={submitManual} className="flex flex-col gap-3 rounded-lg border p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cargar horas manualmente</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="aurelia-fecha" className="text-xs">Fecha</Label>
                    <Input id="aurelia-fecha" type="date" value={manual.fecha} max={todayInArgentina()} onChange={(event) => setManual({ ...manual, fecha: event.target.value })} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="aurelia-horas" className="text-xs">Horas</Label>
                    <Input id="aurelia-horas" type="number" min={0} max={24} inputMode="numeric" value={manual.hours} onChange={(event) => setManual({ ...manual, hours: event.target.value })} placeholder="0" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="aurelia-minutos" className="text-xs">Minutos</Label>
                    <Input id="aurelia-minutos" type="number" min={0} max={59} inputMode="numeric" value={manual.minutes} onChange={(event) => setManual({ ...manual, minutes: event.target.value })} placeholder="30" />
                  </div>
                </div>
                <Textarea value={manual.descripcion} onChange={(event) => setManual({ ...manual, descripcion: event.target.value })} placeholder="Descripción (opcional)" aria-label="Descripción" rows={2} maxLength={500} />
                <Button type="submit" variant="outline" disabled={time.pending || !((Number(manual.hours) || 0) * 60 + (Number(manual.minutes) || 0))} className="gap-1.5 self-end">
                  <Plus className="size-4" aria-hidden="true" />
                  Agregar
                </Button>
              </form>

              {entries.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Todavía no hay horas registradas para este cliente.</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{entry.descripcion ?? 'Sin descripción'}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(`${entry.fecha}T12:00:00`)} · {entry.colaboradorName}</span>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{entry.finalizadoEn ? formatDuration(entrySeconds(entry)) : 'En curso'}</span>
                      {entry.colaboradorId === data.userId && entry.finalizadoEn && (
                        <Button size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground" onClick={() => time.remove(entry.id)} disabled={time.pending} aria-label="Eliminar entrada">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
