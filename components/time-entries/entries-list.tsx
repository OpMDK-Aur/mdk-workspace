'use client'

import { useMemo, useState } from 'react'
import { useTimer } from '@/lib/time-tracking/timer-context'
import type { TimeEntry } from '@/lib/time-tracking/types'
import {
  getProjectById,
  formatDurationShort,
  formatTimeRange,
  getDayLabel,
  calculateDayTotal,
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
import { Play, Pencil, Trash2, DollarSign, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface GroupedEntries {
  date: string
  label: string
  total: number
  entries: TimeEntry[]
}

export function EntriesList() {
  const { entries, continueEntry, deleteEntry, updateEntry } = useTimer()
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [editDescription, setEditDescription] = useState('')

  // Group entries by day
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>()
    
    // Sort entries by started_at descending
    const sorted = [...entries].sort(
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
        total: calculateDayTotal(groupEntries),
        entries: groupEntries,
      })
    })

    return result
  }, [entries])

  const handleContinue = (entry: TimeEntry) => {
    continueEntry(entry)
    toast.success('Timer started')
  }

  const handleDelete = (id: string) => {
    deleteEntry(id)
    toast.success('Entry deleted')
  }

  const handleEdit = (entry: TimeEntry) => {
    setEditingEntry(entry)
    setEditDescription(entry.description)
  }

  const handleSaveEdit = () => {
    if (editingEntry) {
      updateEntry(editingEntry.id, { description: editDescription })
      setEditingEntry(null)
      toast.success('Entry updated')
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Clock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">
          No time entries yet
        </h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Start tracking your time by clicking the play button in the timer bar above.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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
                onContinue={() => handleContinue(entry)}
                onEdit={() => handleEdit(entry)}
                onDelete={() => handleDelete(entry.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit time entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Description
              </label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingEntry(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface EntryRowProps {
  entry: TimeEntry
  onContinue: () => void
  onEdit: () => void
  onDelete: () => void
}

function EntryRow({ entry, onContinue, onEdit, onDelete }: EntryRowProps) {
  const project = entry.project_id ? getProjectById(entry.project_id) : null

  return (
    <div className="group flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors">
      {/* Project Color Dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: project?.color || '#9ca3af' }}
      />

      {/* Description & Project */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {entry.description}
        </p>
        {project && (
          <p className="text-xs text-muted-foreground truncate">
            {project.name}
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
          title="Continue timer"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onEdit}
          title="Edit entry"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Delete entry"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
