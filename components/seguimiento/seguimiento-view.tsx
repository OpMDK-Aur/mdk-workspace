'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { mondayOf, toISODate, type SeguimientoItem, type SeguimientoPayload } from '@/lib/tasks/seguimiento-match'
import { SeguimientoCard } from './seguimiento-card'
import { ItemDialog, type ItemDraft } from './item-dialog'
import { ClientPicker, type ClienteOption } from './client-picker'
import { GRUPO_LABELS, GRUPO_ORDER, PRIORIDAD_RANK, motivationalMessage } from './constants'

interface MetaPayload {
  currentUserId: string
  colaboradores: { id: string; nombre: string; apellido: string | null; avatar_url: string | null }[]
  clientes: ClienteOption[]
}

const jsonFetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo cargar')
  return res.json()
}

const matchFetcher = async ([, usuarioId, semana]: [string, string, string]): Promise<SeguimientoPayload> => {
  const res = await fetch(`/api/tasks/seguimiento/match?usuario_id=${usuarioId}&semana=${semana}`, { method: 'POST' })
  if (!res.ok) throw new Error('No se pudo cargar el seguimiento')
  return res.json()
}

function shiftWeek(semana: string, weeks: number) {
  const d = new Date(`${semana}T12:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return toISODate(d)
}

function formatWeek(semana: string) {
  const start = new Date(`${semana}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 4)
  const fmt = (d: Date) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  return `${fmt(start)} – ${fmt(end)}`
}

function buildDescription(item: SeguimientoItem) {
  if (item.detalles.length === 0) return ''
  return `<ul>${item.detalles.map((d) => `<li>${d.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</li>`).join('')}</ul>`
}

export function SeguimientoView() {
  const router = useRouter()
  const today = toISODate(new Date())
  const { data: meta } = useSWR<MetaPayload>('/api/tasks/seguimiento', jsonFetcher, { revalidateOnFocus: false })

  const [usuarioOverride, setUsuarioOverride] = useState<string | null>(null)
  const usuarioId = usuarioOverride ?? meta?.currentUserId ?? null
  const [semana, setSemana] = useState(() => mondayOf(new Date()))
  const [clienteFiltro, setClienteFiltro] = useState<string | null>(null)
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'pendientes' | 'completados'>('todos')
  const [prioridadFiltro, setPrioridadFiltro] = useState<'todas' | 'alta' | 'media' | 'baja'>('todas')
  const [dialog, setDialog] = useState<{ open: boolean; item: SeguimientoItem | null }>({ open: false, item: null })

  const swrKey = usuarioId ? (['seguimiento', usuarioId, semana] as [string, string, string]) : null
  const { data, isLoading, isValidating, mutate } = useSWR(swrKey, matchFetcher, { revalidateOnFocus: false })

  const clientes = meta?.clientes ?? []
  const items = data?.items ?? []

  const stats = useMemo(() => {
    const total = items.length
    const done = items.filter((i) => i.completado).length
    const open = items.filter((i) => !i.completado)
    return {
      total,
      done,
      pct: total ? Math.round((done / total) * 100) : 0,
      vencidas: open.filter((i) => i.fecha_vencimiento && i.fecha_vencimiento <= today).length,
      alta: open.filter((i) => i.prioridad === 'alta').length,
      pendientes: open.length,
    }
  }, [items, today])

  const grouped = useMemo(() => {
    const filtered = items.filter((i) => {
      if (clienteFiltro && i.cliente_id !== clienteFiltro) return false
      if (estadoFiltro === 'pendientes' && i.completado) return false
      if (estadoFiltro === 'completados' && !i.completado) return false
      if (prioridadFiltro !== 'todas' && i.prioridad !== prioridadFiltro) return false
      return true
    })
    return GRUPO_ORDER.map((grupo) => ({
      grupo,
      items: filtered
        .filter((i) => i.grupo === grupo)
        .sort((a, b) =>
          Number(a.completado) - Number(b.completado) ||
          (PRIORIDAD_RANK[a.prioridad ?? 'baja'] ?? 3) - (PRIORIDAD_RANK[b.prioridad ?? 'baja'] ?? 3) ||
          (a.fecha_vencimiento ?? '9999').localeCompare(b.fecha_vencimiento ?? '9999'),
        ),
    })).filter((g) => g.items.length > 0)
  }, [items, clienteFiltro, estadoFiltro, prioridadFiltro])

  const patchItem = async (id: string, patch: Partial<SeguimientoItem>) => {
    await mutate(
      async (current) => {
        const res = await fetch(`/api/tasks/seguimiento/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error('No se pudo guardar')
        return current
      },
      {
        optimisticData: (current) =>
          current ? { ...current, items: current.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : current!,
        rollbackOnError: true,
        populateCache: false,
        revalidate: true,
      },
    )
  }

  const deleteItem = async (item: SeguimientoItem) => {
    if (!window.confirm(`¿Eliminar "${item.titulo}"?`)) return
    await fetch(`/api/tasks/seguimiento/${item.id}`, { method: 'DELETE' })
    await mutate()
  }

  const saveItem = async (draft: ItemDraft) => {
    const editing = dialog.item
    const res = await fetch(editing ? `/api/tasks/seguimiento/${editing.id}` : '/api/tasks/seguimiento', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? draft : { ...draft, usuario_id: usuarioId, semana }),
    })
    if (!res.ok) return
    setDialog({ open: false, item: null })
    await mutate()
  }

  const createTaskFrom = (item: SeguimientoItem) => {
    const params = new URLSearchParams({ new: '1', titulo: item.titulo, seguimiento_item: item.id })
    if (item.cliente_id) params.set('cliente_id', item.cliente_id)
    params.set('asignado_a', item.usuario_id)
    if (item.prioridad) params.set('prioridad', item.prioridad)
    if (item.fecha_vencimiento) params.set('fecha_vencimiento', item.fecha_vencimiento)
    const description = buildDescription(item)
    if (description) params.set('descripcion', description)
    router.push(`/dashboard/tasks?${params.toString()}`)
  }

  const selectedPerson = meta?.colaboradores.find((c) => c.id === usuarioId)
  const firstName = selectedPerson?.nombre ?? ''

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-col gap-5 rounded-3xl bg-gradient-to-br from-mdk-orange to-mdk-pink p-6 text-[#141414] md:p-8">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-75">Seguimiento semanal · {formatWeek(semana)}</p>
          <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
            {firstName ? `La semana de ${firstName}` : 'Seguimiento'}
          </h1>
          <p className="text-sm leading-relaxed opacity-85 text-pretty">{motivationalMessage(stats.pct)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm font-semibold">
            <span>{stats.done} de {stats.total} completadas</span>
            <span className="font-mono">{stats.pct}%</span>
          </div>
          <Progress value={stats.pct} className="h-2 bg-[#141414]/15 [&>*]:bg-[#141414]" aria-label="Progreso de la semana" />
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <Counter label="Vencidas o hoy" value={stats.vencidas} />
          <Counter label="Prioridad alta" value={stats.alta} />
          <Counter label="Pendientes" value={stats.pendientes} />
        </dl>
      </header>

      <section aria-label="Filtros" className="flex flex-wrap items-center gap-2">
        <Select value={usuarioId ?? undefined} onValueChange={setUsuarioOverride}>
          <SelectTrigger className="h-9 w-48 rounded-full"><SelectValue placeholder="Responsable" /></SelectTrigger>
          <SelectContent>
            {meta?.colaboradores.map((c) => (
              <SelectItem key={c.id} value={c.id}>{[c.nombre, c.apellido].filter(Boolean).join(' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-full border border-border">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setSemana((s) => shiftWeek(s, -1))} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-28 text-center text-sm">{formatWeek(semana)}</span>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setSemana((s) => shiftWeek(s, 1))} aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <ClientPicker clientes={clientes} value={clienteFiltro} onChange={(c) => setClienteFiltro(c?.id ?? null)} placeholder="Todos los clientes" allowClear className="h-9 w-48" />

        <Select value={estadoFiltro} onValueChange={(v) => setEstadoFiltro(v as typeof estadoFiltro)}>
          <SelectTrigger className="h-9 w-36 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendientes">Pendientes</SelectItem>
            <SelectItem value="completados">Completados</SelectItem>
          </SelectContent>
        </Select>

        <Select value={prioridadFiltro} onValueChange={(v) => setPrioridadFiltro(v as typeof prioridadFiltro)}>
          <SelectTrigger className="h-9 w-36 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda prioridad</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => mutate()} aria-label="Volver a buscar coincidencias">
            <RefreshCw className={cn('h-4 w-4', isValidating && 'animate-spin')} />
          </Button>
          <Button onClick={() => setDialog({ open: true, item: null })} disabled={!usuarioId} className="h-9 gap-1.5 rounded-full bg-gradient-to-r from-mdk-orange to-mdk-pink text-[#141414] hover:opacity-90">
            <Plus className="h-4 w-4" />Nuevo ítem
          </Button>
        </div>
      </section>

      {data && data.summary.pendiente > 0 && (
        <p className="text-sm text-muted-foreground">
          {data.summary.vinculada} vinculadas · {data.summary.pendiente} para elegir · {data.summary.sin_match} sin tarea
        </p>
      )}

      {isLoading || !meta ? (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? 'No hay ítems de seguimiento para esta semana.' : 'Ningún ítem coincide con los filtros.'}
          </p>
          {items.length === 0 && (
            <Button variant="outline" className="rounded-full" onClick={() => setDialog({ open: true, item: null })}>
              <Plus className="h-4 w-4" />Agregar el primero
            </Button>
          )}
        </div>
      ) : (
        grouped.map(({ grupo, items: groupItems }) => (
          <section key={grupo} className="flex flex-col gap-3" aria-labelledby={`grupo-${grupo}`}>
            <div className="flex items-baseline justify-between">
              <h2 id={`grupo-${grupo}`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {GRUPO_LABELS[grupo]}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                {groupItems.filter((i) => i.completado).length}/{groupItems.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {groupItems.map((item) => (
                <SeguimientoCard
                  key={item.id}
                  item={item}
                  tarea={item.tarea_id ? data?.tareas[item.tarea_id] : undefined}
                  candidates={data?.candidates[item.id] ?? []}
                  clientes={clientes}
                  today={today}
                  onPatch={(patch) => patchItem(item.id, patch)}
                  onEdit={() => setDialog({ open: true, item })}
                  onDelete={() => deleteItem(item)}
                  onCreateTask={() => createTaskFrom(item)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {items.length > 0 && (
        <footer className="rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          Recordá actualizar el estado de cada tarea en el tablero: cuando una tarea vinculada pasa a <span className="font-medium text-foreground">Resuelto</span>, el ítem se marca solo.
        </footer>
      )}

      <ItemDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        item={dialog.item}
        clientes={clientes}
        onSubmit={saveItem}
      />
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-2xl bg-[#141414]/10 px-3 py-2">
      <dd className="text-2xl font-bold leading-none">{value}</dd>
      <dt className="mt-1 text-xs font-medium opacity-80">{label}</dt>
    </div>
  )
}
