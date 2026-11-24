'use client'

import { useState, type MouseEvent, type PointerEvent } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DevTask } from '@/lib/aurelia/followup-shared'
import { cn } from '@/lib/utils'
import { useAureliaClientOptions, useAureliaTime } from '../use-aurelia-time'

/** Misma convención que el timer de MDK: la descripción identifica la tarea que se está midiendo. */
export const devTaskTimerDescription = (task: Pick<DevTask, 'titulo'>) => `[Tarea] ${task.titulo.trim()}`

const stopPropagation = (event: MouseEvent | PointerEvent) => event.stopPropagation()

export function DevTaskTimerButton({ task, className, showLabel = false }: { task: DevTask; className?: string; showLabel?: boolean }) {
  const time = useAureliaTime()
  const [pickerOpen, setPickerOpen] = useState(false)
  const { data: clientOptions, isLoading: clientsLoading } = useAureliaClientOptions()

  const running = time.data?.available ? time.data.running : null
  const description = devTaskTimerDescription(task)
  const isThisRunning = Boolean(running && running.descripcion?.trim() === description)
  const isOtherRunning = Boolean(running && !isThisRunning)
  const unavailable = time.data?.available === false

  const start = (clientId: string, clientName: string) => {
    setPickerOpen(false)
    // Si había otro timer de Aurelia corriendo, se cierra primero para no superponer horas.
    void (async () => {
      if (isOtherRunning && !(await time.stop())) return
      await time.start(clientId, clientName, description)
    })()
  }

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    if (time.pending || unavailable) return
    if (isThisRunning) {
      void time.stop()
      return
    }
    if (task.clientId) start(task.clientId, task.clientName ?? 'Cliente')
    else setPickerOpen(true)
  }

  const label = isThisRunning ? `Parar timer de ${task.titulo}` : `Iniciar timer de ${task.titulo}`
  const button = (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={stopPropagation}
      onKeyDown={(event) => event.stopPropagation()}
      disabled={time.pending || unavailable}
      aria-label={label}
      title={unavailable ? 'El timer de Aurelia no está disponible' : isThisRunning ? 'Parar timer' : isOtherRunning ? 'Cambiar el timer a esta tarea' : 'Iniciar timer'}
      className={cn(
        'flex shrink-0 items-center justify-center gap-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tasks-brand)] disabled:opacity-50',
        showLabel ? 'h-8 px-3 text-xs font-semibold' : 'size-6',
        isThisRunning
          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
          : 'text-[var(--tasks-text-3)] hover:bg-[var(--tasks-row-hover)] hover:text-[var(--tasks-text)]',
        showLabel && !isThisRunning && 'border border-[var(--tasks-border)]',
        className,
      )}
    >
      {time.pending ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : isThisRunning ? <Square className="size-2.5 fill-current" aria-hidden="true" /> : <Play className="size-3 fill-current" aria-hidden="true" />}
      {showLabel && <span>{isThisRunning ? 'Parar timer' : 'Iniciar timer'}</span>}
    </button>
  )

  if (task.clientId) return button

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">La tarea no tiene cliente: elegí a cuál cargarle el tiempo.</p>
        <Command>
          <CommandInput placeholder="Buscar cliente de Aurelia..." />
          <CommandList>
            <CommandEmpty>{clientsLoading ? 'Cargando clientes...' : 'Sin resultados'}</CommandEmpty>
            <CommandGroup>
              {(clientOptions ?? []).map((option) => (
                <CommandItem key={option.id} value={`${option.label} ${option.id}`} onSelect={() => start(option.id, option.label)}>
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
