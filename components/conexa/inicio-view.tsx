'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, Plug, Quote, Timer, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { dashboardApiFetch } from '@/lib/conexa/dashboard-fetch'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import { AR_TIME_ZONE, CONNECTION_LABELS, missingConnections, type ConnectionKey, type InicioConnection, alertLabel, firstName, formatWorked, groupAlerts, isRecentAlert, phraseOfTheDay, todayRange, type InicioAlert, type InicioData, type InicioTask } from '@/lib/conexa/inicio'

const fetchInicio = async (url: string) => {
  const response = await dashboardApiFetch(url)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar tu resumen de hoy.')
  return payload as InicioData
}

const timeFormat = new Intl.DateTimeFormat('es-AR', { timeZone: AR_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('es-AR', { timeZone: AR_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' })

export function InicioView({ onOpenClient }: { onOpenClient: (clientId: string) => void }) {
  const { data, error, isLoading } = useSWR('/api/conexa/inicio', fetchInicio, { refreshInterval: 60_000, revalidateOnFocus: true })
  const timerRunning = useTimerStore((state) => state.isRunning)
  const { day } = todayRange()
  const name = firstName(data?.nombre)
  const today = dayFormat.format(new Date())

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 md:px-8">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground first-letter:uppercase">{today}</p>
            {isLoading && !data ? <Skeleton className="h-10 w-64" /> : (
              <h1 className="font-display text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">Hola <span aria-hidden="true" className="font-sans font-normal" style={{ fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif" }}>👋🏼</span>{name ? ` ${name}` : ''}</h1>
            )}
          </div>
          <figure className="flex max-w-md items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <Quote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <blockquote className="text-pretty text-sm leading-relaxed text-foreground">{phraseOfTheDay(day, data?.nombre ?? '')}</blockquote>
          </figure>
        </header>

        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error.message}</p>}

        {!(error && !data) && <>
        <WorkedCard loading={isLoading && !data} seconds={data?.segundosHoy ?? 0} running={timerRunning || Boolean(data?.timerCorriendo)} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <TasksSection loading={isLoading && !data} tasks={data?.tareas ?? []} overdue={data?.vencidas ?? 0} />
          <AlertsSection loading={isLoading && !data} alerts={data?.alertas ?? []} onOpenClient={onOpenClient} />
        </div>
        <ConnectionsSection loading={isLoading && !data} connections={data?.conexiones ?? []} />
        </>}
      </div>
    </div>
  )
}

function WorkedCard({ loading, seconds, running }: { loading: boolean; seconds: number; running: boolean }) {
  return (
    <section aria-label="Horas de hoy" className={cn('flex flex-col gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between', running ? 'border-border bg-card' : 'border-primary/40 bg-primary/10')}>
      <div className="flex items-center gap-3">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', running ? 'bg-status-verde/10 text-status-verde' : 'bg-primary text-primary-foreground')}>
          <Timer className="size-4" aria-hidden="true" />
        </span>
        {loading ? <Skeleton className="h-5 w-48" /> : <p className="text-sm leading-relaxed text-foreground">Hoy venís trabajando <strong className="font-semibold">{formatWorked(seconds)}</strong>.</p>}
      </div>
      {!loading && (running
        ? <p className="flex items-center gap-1.5 text-xs font-medium text-status-verde"><span className="size-1.5 animate-pulse rounded-full bg-status-verde" aria-hidden="true" />El timer está corriendo</p>
        : <p className="text-pretty text-sm font-medium leading-relaxed text-primary">No te olvides de iniciar el timer, arriba a la derecha.</p>)}
    </section>
  )
}

function SectionCard({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className="text-primary">{icon}</span>{title}</h2>
        {action}
      </header>
      <div className="flex flex-col p-2">{children}</div>
    </section>
  )
}

function ListSkeleton() {
  return <div className="flex flex-col gap-2 p-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-12 w-full" />)}</div>
}

function TasksSection({ loading, tasks, overdue }: { loading: boolean; tasks: InicioTask[]; overdue: number }) {
  return (
    <SectionCard title="Estas son tus tareas hoy" icon={<CheckCircle2 className="size-4" aria-hidden="true" />} action={<Link href="/dashboard/tasks" className="text-xs font-medium text-muted-foreground hover:text-foreground">Ver todas</Link>}>
      {loading ? <ListSkeleton /> : tasks.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm leading-relaxed text-muted-foreground">No tenés tareas ni reuniones para hoy.</p>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted">
              <span className="flex w-12 shrink-0 flex-col items-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                {task.esReunion ? <CalendarClock className="mb-0.5 size-3.5 text-primary" aria-label="Reunión" /> : null}
                {task.reunionInicio ? timeFormat.format(new Date(task.reunionInicio)) : 'Hoy'}
              </span>
              <Link href={`/dashboard/tasks?task=${task.id}`} className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{task.titulo}</span>
                {task.clienteNombre && <span className="truncate text-xs text-muted-foreground">{task.clienteNombre}</span>}
              </Link>
              {task.meetUrl && <Button asChild size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs"><a href={task.meetUrl} target="_blank" rel="noreferrer"><Video className="size-3.5" aria-hidden="true" />Unirse</a></Button>}
            </li>
          ))}
        </ul>
      )}
      {!loading && overdue > 0 && (
        <Link href="/dashboard/tasks" className="mx-2 mb-2 mt-1 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          <Clock3 className="size-3.5 text-primary" aria-hidden="true" />
          {`Además tenés ${overdue} ${overdue === 1 ? 'tarea vencida' : 'tareas vencidas'}.`}
          <ArrowRight className="ml-auto size-3.5" aria-hidden="true" />
        </Link>
      )}
    </SectionCard>
  )
}

function AlertsSection({ loading, alerts, onOpenClient }: { loading: boolean; alerts: InicioAlert[]; onOpenClient: (clientId: string) => void }) {
  const groups = groupAlerts(alerts)
  return (
    <SectionCard title="Revisá por favor estas cuentas" icon={<AlertTriangle className="size-4" aria-hidden="true" />} action={alerts.length ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{alerts.length}</span> : undefined}>
      {loading ? <ListSkeleton /> : groups.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm leading-relaxed text-muted-foreground">Ninguna de tus cuentas tiene alertas activas. Todo en orden por ahora.</p>
      ) : (
        <div className="flex flex-col gap-3 py-1">
          {groups.map((group) => (
            <div key={group.id} className="flex flex-col">
              <h3 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
              <ul className="flex flex-col">
                {group.alerts.map((alert) => (
                  <li key={alert.id}>
                    <button type="button" onClick={() => onOpenClient(alert.clienteId)} className="group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">{alert.clienteNombre}</span>
                          <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-muted-foreground">{alertLabel(alert.subtipo)}</span>
                          {alert.plataforma && alert.plataforma !== 'ambas' && <span className="text-[10px] capitalize text-muted-foreground">{alert.plataforma}</span>}
                          {isRecentAlert(alert) && <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">Nueva</span>}
                        </span>
                        {alert.mensaje && <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{alert.mensaje}</span>}
                      </span>
                      <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      <span className="sr-only">Abrir el tablero de {alert.clienteNombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

const CONNECTION_ORDER: ConnectionKey[] = ['meta', 'google', 'analytics', 'tag_manager']

function ConnectionsSection({ loading, connections }: { loading: boolean; connections: InicioConnection[] }) {
  const [showComplete, setShowComplete] = useState(false)
  const pending = connections.filter((item) => missingConnections(item).length > 0)
  const complete = connections.filter((item) => missingConnections(item).length === 0)
  const visible = showComplete ? [...pending, ...complete] : pending
  return (
    <SectionCard
      title="Conexión de cuentas publicitarias"
      icon={<Plug className="size-4" aria-hidden="true" />}
      action={!loading && connections.length > 0 ? <span className="text-xs text-muted-foreground">{`${complete.length} de ${connections.length} con Meta y Google conectados`}</span> : undefined}
    >
      {loading ? <ListSkeleton /> : connections.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm leading-relaxed text-muted-foreground">No tenés clientes asignados como project o account manager.</p>
      ) : (
        <>
          {pending.length === 0 && !showComplete && <p className="px-3 py-4 text-center text-sm leading-relaxed text-muted-foreground">Todos tus clientes tienen Meta Ads y Google Ads conectados.</p>}
          {visible.length > 0 && (
            <ul className="flex flex-col">
              {visible.map((item) => {
                const missing = missingConnections(item)
                return (
                  <li key={item.clienteId} className="flex flex-col gap-2 rounded-lg px-3 py-2.5 hover:bg-muted sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.clienteNombre}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {CONNECTION_ORDER.map((key) => (
                        <span key={key} className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', item.conectadas[key] ? 'border-border text-muted-foreground' : missing.includes(key) ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border text-muted-foreground/70')}>
                          <span className={cn('size-1.5 rounded-full', item.conectadas[key] ? 'bg-status-verde' : missing.includes(key) ? 'bg-primary' : 'bg-muted-foreground/40')} aria-hidden="true" />
                          {CONNECTION_LABELS[key]}
                          <span className="sr-only">{item.conectadas[key] ? 'conectada' : 'sin conectar'}</span>
                        </span>
                      ))}
                    </span>
                    {missing.length > 0 && <Button asChild size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-xs"><Link href="/dashboard/platform">Conectar</Link></Button>}
                  </li>
                )
              })}
            </ul>
          )}
          {complete.length > 0 && (
            <button type="button" onClick={() => setShowComplete((value) => !value)} className="mx-2 mb-1 mt-1 rounded-lg px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {showComplete ? 'Ocultar los clientes completos' : `Ver también los ${complete.length} clientes con todo conectado`}
            </button>
          )}
        </>
      )}
    </SectionCard>
  )
}
