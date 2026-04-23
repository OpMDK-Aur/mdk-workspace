'use client'

import { useEffect, useState } from 'react'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
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
import { Play, Square, DollarSign, Loader2 } from 'lucide-react'
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
    isRunning,
    startedAt,
    description,
    clientId,
    billable,
    entries,
    startTimer,
    stopTimer,
    setDescription,
    setClientId,
    toggleBillable,
    getElapsedSeconds,
    loadEntries,
  } = useTimerStore()

  const [clients, setClients] = useState<Client[]>([])
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  // Fetch clients and load entries on mount
  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('business_name')

      if (!error && data) {
        setClients(data)
      }
      setIsLoadingClients(false)

      // Load entries to sync with any running timer from Supabase
      await loadEntries()
    }

    init()
  }, [loadEntries])

  // Update elapsed time every second when running
  useEffect(() => {
    if (!isRunning) {
      setElapsedSeconds(0)
      return
    }

    // Initial calculation
    setElapsedSeconds(getElapsedSeconds())

    const interval = setInterval(() => {
      setElapsedSeconds(getElapsedSeconds())
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, startedAt, getElapsedSeconds])

  const selectedClient = clients.find((c) => c.id === clientId)
  const lastEntry = entries.find((e) => e.ended_at !== null)

  const handleStart = async () => {
    setIsStarting(true)
    try {
      await startTimer()
      toast.success('Timer iniciado')
    } catch (error) {
      toast.error('Error al iniciar el timer')
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    setIsStopping(true)
    try {
      await stopTimer()
      toast.success('Tiempo guardado correctamente')
    } catch (error) {
      toast.error('Error al guardar el tiempo')
    } finally {
      setIsStopping(false)
    }
  }

  const handleClientChange = async (val: string) => {
    await setClientId(val || null)
  }

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Description Input */}
        <div className="flex-1 min-w-0">
          <Input
            placeholder="What are you working on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-0"
          />
        </div>

        {/* Client Selector */}
        <Select
          value={clientId || ''}
          onValueChange={handleClientChange}
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
            billable
              ? 'text-primary hover:text-primary'
              : 'text-muted-foreground hover:text-muted-foreground'
          )}
          title={billable ? 'Billable' : 'Non-billable'}
        >
          <DollarSign className="h-4 w-4" />
        </Button>

        {/* Timer Display */}
        <div className="font-mono text-xl font-semibold tabular-nums w-24 text-right shrink-0">
          {isRunning
            ? formatDuration(elapsedSeconds)
            : lastEntry
              ? formatDurationShort(lastEntry.duration_sec)
              : '00:00:00'}
        </div>

        {/* Start/Stop Button */}
        <Button
          onClick={isRunning ? handleStop : handleStart}
          variant={isRunning ? 'destructive' : 'default'}
          size="icon"
          disabled={isStarting || isStopping}
          className={cn(
            'shrink-0 h-10 w-10 rounded-full',
            !isRunning && 'bg-status-verde hover:bg-status-verde/90 text-white'
          )}
        >
          {isStarting || isStopping ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isRunning ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </Button>
      </div>
    </div>
  )
}
