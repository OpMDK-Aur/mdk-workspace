'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTimerStore, type TimeEntry } from '@/lib/time-tracking/timer-store'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
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
import { cn } from '@/lib/utils'
import { Play, Pencil, Trash2, DollarSign, Clock, Loader2 } from 'lucide-react'
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
  return entries.reduce((acc, e) => acc + (e.duration_sec || 0), 0)
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
  const [clients, setClients] = useState<Client[]>([])
  const [runningElapsed, setRunningElapsed] = useState(0)

  // Load entries from Supabase on mount
  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // Fetch clients from Supabase
  useEffect(() => {
    async function fetchClients() {
      const supabase = createClient()
      const { data } = await supabase.from('clients').select('*').order('business_name')
      if (data) setClients(data)
    }

    fetchClients()
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

  // Helper to get client by id
  const getClient = (clientId: string | null): Client | undefined => {
    if (!clientId) return undefined
    return clients.find((c) => c.id === clientId)
  }

  // Separate running entry from completed entries
  const { runningEntry, completedEntries } = useMemo(() => {
    const running = entries.find((e) => e.ended_at === null)
    const completed = entries.filter((e) => e.ended_at !== null)
    return { runningEntry: running, completedEntries: completed }
  }, [entries])

  // Group completed entries by day
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>()
    
    // Sort entries by started_at descending
    const sorted = [...completedEntries].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    )

    sorted.forEach((entry) => {
      const dateKey = new Date(entry.started_at).toDateString()
      const existing = groups.get(dateKey) || []
      groups.set(dateKey, [...existing, entry])
    })

    const result: GroupedEntries[] = []
    groups.forEach((groupEntries, dateKey) => {
      result.push({
        date: dateKey,
        label: getDayLabel(dateKey),
        total: calculateTotalSeconds(groupEntries),
        entries: groupEntries,
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

  const handleEdit = (entry: TimeEntry) => {
    setEditingEntry(entry)
    setEditDescription(entry.description)
  }

  const handleSaveEdit = async () => {
    if (editingEntry) {
      await updateEntry(editingEntry.id, { description: editDescription })
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
            client={getClient(runningEntry.client_id)}
            elapsedSeconds={runningElapsed}
            onEdit={() => handleEdit(runningEntry)}
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
            {group.entries.map((entry) => {
              const client = getClient(entry.client_id)
              return (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  client={client}
                  onContinue={() => handleContinue(entry)}
                  onEdit={() => handleEdit(entry)}
                  onDelete={() => handleDelete(entry.id)}
                />
              )
            })}
          </div>
        </div>
      ))}

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Descripción
              </label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingEntry(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit}>Guardar cambios</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface RunningEntryRowProps {
  entry: TimeEntry
  client?: Client
  elapsedSeconds: number
  onEdit: () => void
}

function RunningEntryRow({ entry, client, elapsedSeconds, onEdit }: RunningEntryRowProps) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-status-verde/10 border border-status-verde/30">
      {/* Client Color Dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: client ? getClientColor(client.id) : '#9ca3af' }}
      />

      {/* Description & Client */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {entry.description}
        </p>
        {client && (
          <p className="text-xs text-muted-foreground truncate">
            {client.business_name}
          </p>
        )}
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
            entry.billable ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
      </div>

      {/* Edit Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onEdit}
        title="Editar entrada"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

interface EntryRowProps {
  entry: TimeEntry
  client?: Client
  onContinue: () => void
  onEdit: () => void
  onDelete: () => void
}

function EntryRow({ entry, client, onContinue, onEdit, onDelete }: EntryRowProps) {
  return (
    <div className="group flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors">
      {/* Client Color Dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: client ? getClientColor(client.id) : '#9ca3af' }}
      />

      {/* Description & Client */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {entry.description}
        </p>
        {client && (
          <p className="text-xs text-muted-foreground truncate">
            {client.business_name}
          </p>
        )}
      </div>

      {/* Time Range */}
      <div className="text-sm text-muted-foreground shrink-0">
        {formatTimeRange(entry.started_at, entry.ended_at)}
      </div>

      {/* Duration */}
      <div className="font-mono text-sm font-medium tabular-nums w-16 text-right shrink-0">
        {formatDurationShort(entry.duration_sec)}
      </div>

      {/* Billable Icon */}
      <div className="shrink-0">
        <DollarSign
          className={cn(
            'h-4 w-4',
            entry.billable ? 'text-primary' : 'text-muted-foreground/40'
          )}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onContinue}
          title="Continuar timer"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onEdit}
          title="Editar entrada"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Eliminar entrada"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
