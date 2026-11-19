'use client'

import { useEffect, useMemo, useState } from 'react'
import { Gem, Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchCombobox } from '@/components/time-tracking/search-combobox'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import { cn } from '@/lib/utils'
import { entrySeconds, formatClock } from '@/lib/aurelia/time-shared'
import { useAureliaClientOptions, useAureliaTime, useNow } from './use-aurelia-time'

/** Misma barra que el timer de MDK, pero sobre los clientes del CRM de Aurelia. */
export function AureliaTimerBar() {
  const time = useAureliaTime()
  const { data: clientOptions, isLoading: clientsLoading, error: clientsError } = useAureliaClientOptions()
  const running = time.data?.available ? time.data.running : null
  const now = useNow(Boolean(running))

  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  const mdkRunning = useTimerStore((state) => state.isRunning)
  useEffect(() => { void useTimerStore.persist.rehydrate() }, [])

  // Mientras corre, la barra muestra lo que se está midiendo (también si se inició desde la ficha del cliente).
  useEffect(() => {
    if (running) {
      setClientId(running.clientId)
      setDescription(running.descripcion ?? '')
    }
  }, [running?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => clientOptions ?? [], [clientOptions])
  const recentIds = useMemo(() => {
    if (!time.data?.available) return []
    const ids: string[] = []
    for (const entry of time.data.entries) {
      if (entry.colaboradorId !== time.data.userId || ids.includes(entry.clientId)) continue
      ids.push(entry.clientId)
      if (ids.length === 5) break
    }
    return ids
  }, [time.data])

  const labelFor = (id: string | null) => options.find((option) => option.id === id)?.label ?? running?.clientName ?? 'Cliente'
  const missingDescription = !description.trim()
  const missingClient = !clientId
  const tableMissing = time.data?.available === false

  const handleStart = async () => {
    if (missingDescription || missingClient) {
      setShowErrors(true)
      toast.error(missingClient && missingDescription ? 'Completá la descripción y el cliente' : missingClient ? 'Elegí un cliente de Aurelia' : 'Completá la descripción')
      return
    }
    setShowErrors(false)
    await time.start(clientId!, labelFor(clientId), description)
  }

  const handleStop = async () => {
    if (await time.stop()) {
      setDescription('')
      setClientId(null)
    }
  }

  const handleClientChange = (id: string) => {
    setClientId(id)
    if (running && id !== running.clientId) void time.updateRunning({ clientId: id, clientName: labelFor(id) })
  }

  const handleDescriptionBlur = () => {
    if (running && description.trim() !== (running.descripcion ?? '')) void time.updateRunning({ descripcion: description })
  }

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 pb-1 pt-2">
        <Gem className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">Timer</span>
        <Badge variant="secondary" className="h-5 px-2 text-xs">Aurelia</Badge>
        {mdkRunning && !running && <span className="truncate text-xs text-muted-foreground">Tenés un timer de MDK corriendo: se detiene al iniciar este.</span>}
        {tableMissing && <span className="truncate text-xs text-destructive">{time.data && !time.data.available ? time.data.message : ''}</span>}
        {clientsError && <span className="truncate text-xs text-destructive">No se pudieron cargar los clientes del CRM.</span>}
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Input
            placeholder="¿En qué estás trabajando?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={handleDescriptionBlur}
            maxLength={500}
            aria-label="Descripción"
            aria-invalid={(showErrors && missingDescription) || undefined}
            className={cn('bg-transparent text-base shadow-none focus-visible:ring-0', showErrors && missingDescription ? 'border-destructive px-2 ring-1 ring-destructive' : 'border-0 px-0')}
          />
        </div>

        <SearchCombobox
          options={options}
          value={clientId}
          onChange={handleClientChange}
          placeholder={clientsLoading ? 'Cargando...' : 'Cliente de Aurelia'}
          searchPlaceholder="Buscar cliente del CRM..."
          emptyText="Sin resultados"
          disabled={clientsLoading || tableMissing}
          invalid={showErrors && missingClient}
          recentIds={recentIds}
          className="w-[140px] shrink sm:w-[220px]"
          renderOption={(option) => <span className="truncate">{option.label}</span>}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="w-24 shrink-0 text-right font-mono text-xl font-semibold tabular-nums" aria-live="off">
            {running ? formatClock(entrySeconds(running, now)) : '00:00:00'}
          </div>
          <Button
            onClick={running ? handleStop : handleStart}
            size="icon"
            disabled={time.pending || tableMissing}
            aria-label={running ? 'Detener timer de Aurelia' : 'Iniciar timer de Aurelia'}
            className={cn('size-10 shrink-0 rounded-full border-0 text-primary-foreground', running ? 'bg-destructive hover:bg-destructive/90' : 'bg-chart-2 hover:bg-chart-2/90')}
          >
            {time.pending ? <Loader2 className="size-4 animate-spin" /> : running ? <Square className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
