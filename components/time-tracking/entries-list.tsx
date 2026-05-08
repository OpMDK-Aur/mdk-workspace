'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTimerStore, type TimeEntry } from '@/lib/time-tracking/timer-store'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, TipoDeTarea } from '@/lib/types'
import {
  formatDuration,
  formatDurationShort,
  formatTimeRange,
  getDayLabel,
} from '@/lib/time-tracking/mock-data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Play, Pencil, Trash2, DollarSign, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function getClientColor(id: string): string {
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function calculateTotalSeconds(entries: TimeEntry[]): number {
  return entries.reduce((acc, e) => acc + (e.duracion_seg || 0), 0)
}

interface GroupedEntries {
  date: string
  label: string
  total: number
  entries: TimeEntry[]
}

export function EntriesList() {
  const { entries, continueEntry, deleteEntry, updateEntry, isLoading, loadEntries, isRunning, startedAt, getElapsedSeconds } = useTimerStore()
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tiposTarea, setTiposTarea] = useState<TipoDeTarea[]>([])
  const [runningElapsed, setRunningElapsed] = useState(0)

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: clientesData } = await supabase
        .from('Clientes')
        .select('*')
        .order('nombre_del_negocio')
      if (clientesData) setClientes(clientesData)

      const { data: tipos } = await supabase
        .from('tipo_de_tareas')
        .select('*')
        .eq('activo', true)
        .order('nombre')
      if (tipos) setTiposTarea(tipos)
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (!isRunning) { setRunningElapsed(0); return }
    setRunningElapsed(getElapsedSeconds())
    const interval = setInterval(() => setRunningElapsed(getElapsedSeconds()), 1000)
    return () => clearInterval(interval)
  }, [isRunning, startedAt, getElapsedSeconds])

  const getCliente = (clienteId: string | null) =>
    clienteId ? clientes.find((c) => c.id === clienteId) : undefined

  const getTipoTarea = (tipoId: string | null) =>
    tipoId ? tiposTarea.find((t) => t.id === tipoId) : undefined

  const { runningEntry, completedEntries } = useMemo(() => ({
    runningEntry: entries.find((e) => e.finalizado_en === null),
    completedEntries: entries.filter((e) => e.finalizado_en !== null),
  }), [entries])

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { isoDate: string; entries: TimeEntry[] }>()
    const sorted = [...completedEntries].sort(
      (a, b) => new Date(b.iniciado_en).getTime() - new Date(a.iniciado_en).getTime()
    )
    sorted.forEach((entry) => {
      const dateKey = new Date(entry.iniciado_en).toDateString()
      const existing = groups.get(dateKey)
      if (existing) {
        existing.entries.push(entry)
      } else {
        groups.set(dateKey, { isoDate: entry.iniciado_en, entries: [entry] })
      }
    })
    const result: GroupedEntries[] = []
    groups.forEach((group, dateKey) => {
      result.push({
        date: dateKey,
        label: getDayLabel(group.isoDate),
        total: calculateTotalSeconds(group.entries),
        entries: group.entries,
      })
    })
    return result
  }, [completedEntries])

  const handleSaveEdit = async () => {
    if (editingEntry) {
      await updateEntry(editingEntry.id, { descripcion: editDescription })
      setEditingEntry(null)
      toast.success('Entrada actualizada')
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Cargando entradas...</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Clock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">No hay entradas de tiempo</h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Comenzá a registrar tu tiempo usando el botón de play en la barra superior.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Entrada en progreso */}
      {runningEntry && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-verde opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-status-verde" />
            </div>
            <h3 className="font-medium text-foreground">En progreso</h3>
          </div>
          <RunningEntryRow
            entry={runningEntry}
            cliente={getCliente(runningEntry.cliente_id)}
            tipoTarea={getTipoTarea(runningEntry.tipo_tarea_id)}
            elapsedSeconds={runningElapsed}
            onEdit={() => { setEditingEntry(runningEntry); setEditDescription(runningEntry.descripcion) }}
          />
        </div>
      )}

      {/* Entradas completadas agrupadas por día */}
      {groupedEntries.map((group) => (
        <div key={group.date}>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
            <h3 className="font-medium text-foreground">{group.label}</h3>
            <span className="text-sm text-muted-foreground">{formatDurationShort(group.total)}</span>
          </div>
          <div className="space-y-2">
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                cliente={getCliente(entry.cliente_id)}
                tipoTarea={getTipoTarea(entry.tipo_tarea_id)}
                onContinue={() => { continueEntry(entry); toast.success('Timer iniciado') }}
                onEdit={() => { setEditingEntry(entry); setEditDescription(entry.descripcion) }}
                onDelete={() => { deleteEntry(entry.id); toast.success('Entrada eliminada') }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Dialog de edición */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground">Descripción</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingEntry(null)}>Cancelar</Button>
              <Button onClick={handleSaveEdit}>Guardar cambios</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── RunningEntryRow ────────────────────────────────────────────────────────────

interface RunningEntryRowProps {
  entry: TimeEntry
  cliente?: Cliente
  tipoTarea?: TipoDeTarea
  elapsedSeconds: number
  onEdit: () => void
}

function RunningEntryRow({ entry, cliente, tipoTarea, elapsedSeconds, onEdit }: RunningEntryRowProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-status-verde/10 border border-status-verde/30">
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: cliente ? getClientColor(cliente.id) : '#9ca3af' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{entry.descripcion}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {cliente && (
            <p className="text-xs text-muted-foreground truncate">{cliente.nombre_del_negocio}</p>
          )}
          {tipoTarea && (
            <Badge
              variant="secondary"
              className="text-xs h-4 px-1.5"
              style={tipoTarea.color ? { borderColor: tipoTarea.color, color: tipoTarea.color } : {}}
            >
              {tipoTarea.nombre}
            </Badge>
          )}
        </div>
      </div>
      <div className="font-mono text-lg font-semibold tabular-nums text-status-verde shrink-0">
        {formatDuration(elapsedSeconds)}
      </div>
      <DollarSign className={cn('h-4 w-4 shrink-0', entry.facturable ? 'text-primary' : 'text-muted-foreground/40')} />
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onEdit} title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ── EntryRow ──────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: TimeEntry
  cliente?: Cliente
  tipoTarea?: TipoDeTarea
  onContinue: () => void
  onEdit: () => void
  onDelete: () => void
}

function EntryRow({ entry, cliente, tipoTarea, onContinue, onEdit, onDelete }: EntryRowProps) {
  return (
    <div className="group flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors">
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: cliente ? getClientColor(cliente.id) : '#9ca3af' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{entry.descripcion}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {cliente && (
            <p className="text-xs text-muted-foreground truncate">{cliente.nombre_del_negocio}</p>
          )}
          {tipoTarea && (
            <Badge
              variant="outline"
              className="text-xs h-4 px-1.5"
              style={tipoTarea.color ? { borderColor: tipoTarea.color, color: tipoTarea.color } : {}}
            >
              {tipoTarea.nombre}
            </Badge>
          )}
        </div>
      </div>
      <div className="text-sm text-muted-foreground shrink-0">
        {formatTimeRange(entry.iniciado_en, entry.finalizado_en)}
      </div>
      <div className="font-mono text-sm font-medium tabular-nums w-16 text-right shrink-0">
        {formatDurationShort(entry.duracion_seg)}
      </div>
      <DollarSign className={cn('h-4 w-4 shrink-0', entry.facturable ? 'text-primary' : 'text-muted-foreground/40')} />
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onContinue} title="Continuar">
          <Play className="h-3.5 w-3.5 fill-current" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete} title="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
