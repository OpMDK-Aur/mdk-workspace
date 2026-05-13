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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Play, Trash2, DollarSign, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Generate a color from client id for visual distinction
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

// Calculate total seconds for entries
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
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tiposTarea, setTiposTarea] = useState<TipoDeTarea[]>([])
  const [runningElapsed, setRunningElapsed] = useState(0)

  // Load entries from Supabase on mount
  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // Fetch clientes and tipos de tarea from Supabase
  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: clientesData } = await supabase.from('clientes').select('*').order('nombre_del_negocio')
      if (clientesData) setClientes(clientesData)

      const { data: tiposData } = await supabase.from('tipo_de_tareas').select('*').eq('activo', true).order('nombre')
      if (tiposData) setTiposTarea(tiposData)
    }

    fetchData()
  }, [])

  // Update running entry elapsed time every second
  useEffect(() => {
    if (!isRunning) {
      setRunningElapsed(0)
      return
    }

    setRunningElapsed(getElapsedSeconds())

    const interval = setInterval(() => {
      setRunningElapsed(getElapsedSeconds())
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, startedAt, getElapsedSeconds])

  // Helper to get cliente by id
  const getCliente = (clienteId: string | null): Cliente | undefined => {
    if (!clienteId) return undefined
    return clientes.find((c) => c.id === clienteId)
  }

  // Helper to get tipo tarea by id
  const getTipoTarea = (tipoId: string | null): TipoDeTarea | undefined => {
    if (!tipoId) return undefined
    return tiposTarea.find((t) => t.id === tipoId)
  }

  // Separate running entry from completed entries
  const { runningEntry, completedEntries } = useMemo(() => {
    const running = entries.find((e) => e.finalizado_en === null)
    const completed = entries.filter((e) => e.finalizado_en !== null)
    return { runningEntry: running, completedEntries: completed }
  }, [entries])

  // Group completed entries by day
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { isoDate: string; entries: TimeEntry[] }>()
    
    // Sort entries by iniciado_en descending
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
    groups.forEach((group) => {
      result.push({
        date: group.isoDate,
        label: getDayLabel(group.isoDate),
        total: calculateTotalSeconds(group.entries),
        entries: group.entries,
      })
    })

    return result
  }, [completedEntries])

  const handleContinue = async (entry: TimeEntry) => {
    await continueEntry(entry)
    toast.success('Timer iniciado')
  }

  const handleDelete = async (id: string) => {
    await deleteEntry(id)
    toast.success('Entrada eliminada')
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
        <h3 className="text-lg font-medium text-foreground mb-1">
          No hay entradas de tiempo
        </h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Comienza a registrar tu tiempo usando el botón de play en la barra superior.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Running Entry - Always at top with pulsing indicator */}
      {runningEntry && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-verde opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-status-verde"></span>
            </div>
            <h3 className="font-medium text-foreground">En progreso</h3>
          </div>
<RunningEntryRow
  entry={runningEntry}
  cliente={getCliente(runningEntry.cliente_id)}
  tipoTarea={getTipoTarea(runningEntry.tipo_tarea_id)}
  elapsedSeconds={runningElapsed}
          />
        </div>
      )}

      {/* Completed Entries grouped by day */}
      {groupedEntries.map((group) => (
        <div key={group.date}>
          {/* Day Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
            <h3 className="font-medium text-foreground">{group.label}</h3>
            <span className="text-sm text-muted-foreground">
              {formatDurationShort(group.total)}
            </span>
          </div>

          {/* Entries */}
          <div className="space-y-2">
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                cliente={getCliente(entry.cliente_id)}
                tipoTarea={getTipoTarea(entry.tipo_tarea_id)}
                clientes={clientes}
                onContinue={() => handleContinue(entry)}
                onUpdate={updateEntry}
                onDelete={() => handleDelete(entry.id)}
              />
            ))}
          </div>
        </div>
      ))}


    </div>
  )
}

interface RunningEntryRowProps {
  entry: TimeEntry
  cliente?: Cliente
  tipoTarea?: TipoDeTarea
  elapsedSeconds: number
}

function RunningEntryRow({ entry, cliente, tipoTarea, elapsedSeconds }: RunningEntryRowProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-status-verde/10 border border-status-verde/30">
      {/* Client Color Dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: cliente ? getClientColor(cliente.id) : '#9ca3af' }}
      />

      {/* Description & Client */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {entry.descripcion}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {cliente && (
            <p className="text-xs text-muted-foreground truncate">
              {cliente.nombre_del_negocio}
            </p>
          )}
          {tipoTarea && (
            <span className="text-xs text-primary">{tipoTarea.nombre}</span>
          )}
        </div>
      </div>

      {/* Live Duration */}
      <div className="font-mono text-lg font-semibold tabular-nums text-status-verde shrink-0">
        {formatDuration(elapsedSeconds)}
      </div>

      {/* Billable Icon */}
      <div className="shrink-0">
        <DollarSign
          className={cn(
            'h-4 w-4',
            entry.facturable ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
      </div>

    </div>
  )
}

interface EntryRowProps {
  entry: TimeEntry
  cliente?: Cliente
  tipoTarea?: TipoDeTarea
  clientes: Cliente[]
  onContinue: () => void
  onUpdate: (id: string, updates: Partial<TimeEntry>) => Promise<void>
  onDelete: () => void
}

function EntryRow({ entry, cliente, tipoTarea, clientes, onContinue, onUpdate, onDelete }: EntryRowProps) {
  const [editingField, setEditingField] = useState<'description' | 'client' | 'start' | 'end' | null>(null)
  const [tempDescription, setTempDescription] = useState(entry.descripcion)
  const [tempClienteId, setTempClienteId] = useState(entry.cliente_id)
  const [tempStart, setTempStart] = useState('')
  const [tempEnd, setTempEnd] = useState('')

  // Format time for input (HH:MM)
  const formatTimeForInput = (isoString: string | null) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  // Get just the time portion for display
  const getTimeDisplay = (isoString: string | null) => {
    if (!isoString) return '--:--'
    const date = new Date(isoString)
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  const handleStartEditDescription = () => {
    setTempDescription(entry.descripcion)
    setEditingField('description')
  }

  const handleStartEditClient = () => {
    setTempClienteId(entry.cliente_id)
    setEditingField('client')
  }

  const handleStartEditStart = () => {
    setTempStart(formatTimeForInput(entry.iniciado_en))
    setEditingField('start')
  }

  const handleStartEditEnd = () => {
    setTempEnd(formatTimeForInput(entry.finalizado_en))
    setEditingField('end')
  }

  const handleSaveDescription = async () => {
    if (tempDescription !== entry.descripcion) {
      await onUpdate(entry.id, { descripcion: tempDescription })
    }
    setEditingField(null)
  }

  const handleSaveClient = async (newClientId: string) => {
    if (newClientId !== entry.cliente_id) {
      await onUpdate(entry.id, { cliente_id: newClientId })
    }
    setEditingField(null)
  }

  const handleSaveTime = async (field: 'start' | 'end', timeValue: string) => {
    const [hours, minutes] = timeValue.split(':').map(Number)
    const baseDate = new Date(field === 'start' ? entry.iniciado_en : (entry.finalizado_en || entry.iniciado_en))
    baseDate.setHours(hours, minutes, 0, 0)
    
    const updates: Partial<TimeEntry> = {}
    if (field === 'start') {
      updates.iniciado_en = baseDate.toISOString()
      // Recalculate duration
      if (entry.finalizado_en) {
        const endTime = new Date(entry.finalizado_en).getTime()
        updates.duracion_seg = Math.floor((endTime - baseDate.getTime()) / 1000)
      }
    } else {
      updates.finalizado_en = baseDate.toISOString()
      // Recalculate duration
      const startTime = new Date(entry.iniciado_en).getTime()
      updates.duracion_seg = Math.floor((baseDate.getTime() - startTime) / 1000)
    }
    
    await onUpdate(entry.id, updates)
    setEditingField(null)
  }

  return (
    <div className="group flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors">
      {/* Client Color Dot + Client Selector */}
      <div className="flex items-center gap-2 min-w-[180px]">
        <div
          className="h-3 w-3 rounded-full shrink-0 cursor-pointer"
          style={{ backgroundColor: cliente ? getClientColor(cliente.id) : '#9ca3af' }}
          onClick={handleStartEditClient}
        />
        {editingField === 'client' ? (
          <Select 
            value={tempClienteId || ''} 
            onValueChange={(val) => handleSaveClient(val)}
            open={true}
            onOpenChange={(open) => !open && setEditingField(null)}
          >
            <SelectTrigger className="h-7 text-xs w-[150px]">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre_del_negocio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span 
            className="text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground"
            onClick={handleStartEditClient}
          >
            {cliente?.nombre_del_negocio || 'Sin cliente'}
          </span>
        )}
      </div>

      {/* Description - Editable */}
      <div className="flex-1 min-w-0">
        {editingField === 'description' ? (
          <Input
            value={tempDescription}
            onChange={(e) => setTempDescription(e.target.value)}
            onBlur={handleSaveDescription}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveDescription()}
            className="h-7 text-sm"
            autoFocus
          />
        ) : (
          <p 
            className="text-sm font-medium text-foreground truncate cursor-pointer hover:text-primary"
            onClick={handleStartEditDescription}
          >
            {entry.descripcion || 'Añadir descripción'}
          </p>
        )}
        {tipoTarea && (
          <span className="text-xs text-primary">{tipoTarea.nombre}</span>
        )}
      </div>

      {/* Time Range - Editable */}
      <div className="flex items-center gap-1 text-sm shrink-0">
        {editingField === 'start' ? (
          <Input
            type="time"
            value={tempStart}
            onChange={(e) => setTempStart(e.target.value)}
            onBlur={() => handleSaveTime('start', tempStart)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveTime('start', tempStart)}
            className="h-7 w-20 text-xs"
            autoFocus
          />
        ) : (
          <span 
            className="cursor-pointer hover:text-primary px-1 rounded hover:bg-muted"
            onClick={handleStartEditStart}
          >
            {getTimeDisplay(entry.iniciado_en)}
          </span>
        )}
        <span className="text-muted-foreground">-</span>
        {editingField === 'end' ? (
          <Input
            type="time"
            value={tempEnd}
            onChange={(e) => setTempEnd(e.target.value)}
            onBlur={() => handleSaveTime('end', tempEnd)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveTime('end', tempEnd)}
            className="h-7 w-20 text-xs"
            autoFocus
          />
        ) : (
          <span 
            className="cursor-pointer hover:text-primary px-1 rounded hover:bg-muted"
            onClick={handleStartEditEnd}
          >
            {getTimeDisplay(entry.finalizado_en)}
          </span>
        )}
      </div>

      {/* Duration */}
      <div className="font-mono text-sm font-medium tabular-nums w-16 text-right shrink-0">
        {formatDurationShort(entry.duracion_seg)}
      </div>

      {/* Billable Icon */}
      <div className="shrink-0">
        <DollarSign
          className={cn(
            'h-4 w-4',
            entry.facturable ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onContinue}
          title="Continuar timer"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Eliminar entrada"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
