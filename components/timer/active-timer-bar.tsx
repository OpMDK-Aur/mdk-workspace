'use client'

import { useEffect, useState } from 'react'
import { useTimer } from '@/lib/time-tracking/timer-context'
import { formatDuration, formatDurationShort } from '@/lib/time-tracking/mock-data'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
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
import { Play, Square, DollarSign } from 'lucide-react'

// Generate a color from client id for visual distinction
function getClientColor(id: string): string {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Get initials from business name
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export function ActiveTimerBar() {
  const {
    timer,
    startTimer,
    stopTimer,
    setDescription,
    setClientId,
    toggleBillable,
    lastEntry,
  } = useTimer()

  const [clients, setClients] = useState<Client[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(true)

  // Fetch clients from Supabase on mount
  useEffect(() => {
    async function fetchClients() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('business_name')

      if (!error && data) {
        setClients(data)
      }
      setIsLoadingClients(false)
    }

    fetchClients()
  }, [])

  const selectedClient = clients.find((c) => c.id === timer.clientId)

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Description Input */}
        <div className="flex-1 min-w-0">
          <Input
            placeholder="What are you working on?"
            value={timer.description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-0"
          />
        </div>

        {/* Client Selector */}
        <Select
          value={timer.clientId || ''}
          onValueChange={(val) => setClientId(val || null)}
          disabled={isLoadingClients}
        >
          <SelectTrigger className="w-[200px] shrink-0">
            <SelectValue placeholder={isLoadingClients ? 'Loading...' : 'Select client'}>
              {selectedClient && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: getClientColor(selectedClient.id) }}
                  >
                    {getInitials(selectedClient.business_name)}
                  </div>
                  <span className="truncate">{selectedClient.business_name}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: getClientColor(client.id) }}
                  >
                    {getInitials(client.business_name)}
                  </div>
                  <span>{client.business_name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Billable Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleBillable}
          className={cn(
            'shrink-0',
            timer.billable
              ? 'text-primary hover:text-primary'
              : 'text-muted-foreground hover:text-muted-foreground'
          )}
          title={timer.billable ? 'Billable' : 'Non-billable'}
        >
          <DollarSign className="h-4 w-4" />
        </Button>

        {/* Timer Display */}
        <div className="font-mono text-xl font-semibold tabular-nums w-24 text-right shrink-0">
          {timer.isRunning
            ? formatDuration(timer.elapsedSeconds)
            : lastEntry
              ? formatDurationShort(lastEntry.duration_sec)
              : '00:00:00'}
        </div>

        {/* Start/Stop Button */}
        <Button
          onClick={timer.isRunning ? stopTimer : startTimer}
          variant={timer.isRunning ? 'destructive' : 'default'}
          size="icon"
          className={cn(
            'shrink-0 h-10 w-10 rounded-full',
            !timer.isRunning && 'bg-status-verde hover:bg-status-verde/90 text-white'
          )}
        >
          {timer.isRunning ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </Button>
      </div>
    </div>
  )
}
