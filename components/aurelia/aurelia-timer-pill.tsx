'use client'

import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { entrySeconds, formatClock, type AureliaTimeEntry } from '@/lib/aurelia/time-shared'
import { useNow } from './use-aurelia-time'

export function AureliaTimerPill({ running, pending, onStop, onOpen }: { running: AureliaTimeEntry; pending: boolean; onStop: () => void; onOpen: () => void }) {
  const now = useNow(true)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 py-1 pl-3 pr-1" role="status" aria-live="polite">
      <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
      <button type="button" onClick={onOpen} className="flex flex-col text-left">
        <span className="max-w-40 truncate text-xs font-medium">{running.clientName ?? 'Cliente'}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatClock(entrySeconds(running, now))}</span>
      </button>
      <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onStop} disabled={pending}>
        <Square className="size-3.5 fill-current" aria-hidden="true" />
        Detener
      </Button>
    </div>
  )
}
