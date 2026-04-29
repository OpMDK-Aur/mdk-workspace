'use client'

import { useEffect, useState } from 'react'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import { formatDuration, formatDurationShort } from '@/lib/time-tracking/mock-data'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, TipoDeTarea } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Play, Square, DollarSign, Loader2, Building2 } from 'lucide-react'
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

interface ColaboradorInfo {
  nombre: string
  departamento: string | null
}

export function ActiveTimerBar() {
  const {
    isRunning,
    startedAt,
    description,
    clientId,
    billable,
    tipoTareaId,
    entries,
    startTimer,
    stopTimer,
    setDescription,
    setClientId,
    setTipoTareaId,
    toggleBillable,
    getElapsedSeconds,
    loadEntries,
  } = useTimerStore()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tiposTarea, setTiposTarea] = useState<TipoDeTarea[]>([])
  const [colaborador, setColaborador] = useState<ColaboradorInfo | null>(null)
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createClient()

      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Obtener colaborador con su departamento
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('nombre, departamentos(nombre)')
          .eq('id', user.id)
          .single()

        if (colab) {
          const dept = (colab.departamentos as { nombre: string } | null)?.nombre ?? null
          setColaborador({
            nombre: colab.nombre,
            departamento: dept,
          })
        }

        // Cargar TODOS los tipos de tarea activos
        const { data: tipos } = await supabase
          .from('tipo_de_tareas')
          .select('*')
          .eq('activo', true)
          .order('nombre')
        
        if (tipos) setTiposTarea(tipos)
      }

      // Cargar clientes
      const { data: clientesData, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre_del_negocio')

      if (!error && clientesData) {
        setClientes(clientesData)
      }
      setIsLoadingClients(false)

      await loadEntries()
    }

    init()
  }, [loadEntries])

  useEffect(() => {
    if (!isRunning) {
      setElapsedSeconds(0)
      return
    }
    setElapsedSeconds(getElapsedSeconds())
    const interval = setInterval(() => {
      setElapsedSeconds(getElapsedSeconds())
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, startedAt, getElapsedSeconds])

  const selectedClient = clientes.find((c) => c.id === clientId)
  const selectedTipo = tiposTarea.find((t) => t.id === tipoTareaId)
  const lastEntry = entries.find((e) => e.finalizado_en !== null)

  const handleStart = async () => {
    setIsStarting(true)
    try {
      await startTimer()
      toast.success('Timer iniciado')
    } catch {
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
    } catch {
      toast.error('Error al guardar el tiempo')
    } finally {
      setIsStopping(false)
    }
  }

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
      {/* Fila superior: departamento del colaborador */}
      {colaborador && (
        <div className="flex items-center gap-2 px-4 pt-2 pb-1 border-b border-border/50">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            {colaborador.nombre}
          </span>
          {colaborador.departamento && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <Badge variant="secondary" className="text-xs h-5 px-2">
                {colaborador.departamento}
              </Badge>
            </>
          )}
        </div>
      )}

      {/* Fila principal: timer */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Descripción */}
        <div className="flex-1 min-w-0">
          <Input
            placeholder="¿En qué estás trabajando?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-0"
          />
        </div>

        {/* Tipo de tarea */}
        <Select
          value={tipoTareaId || ''}
          onValueChange={(val) => setTipoTareaId(val || null)}
          disabled={tiposTarea.length === 0}
        >
          <SelectTrigger className="w-[200px] shrink-0">
            <SelectValue placeholder="Tipo de tarea">
              {selectedTipo && (
                <div className="flex items-center gap-2">
                  {selectedTipo.color && (
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedTipo.color }}
                    />
                  )}
                  <span className="truncate">{selectedTipo.nombre}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tiposTarea.map((tipo) => (
              <SelectItem key={tipo.id} value={tipo.id}>
                <div className="flex items-center gap-2">
                  {tipo.color && (
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tipo.color }}
                    />
                  )}
                  <span>{tipo.nombre}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Cliente */}
        <Select
          value={clientId || ''}
          onValueChange={async (val) => await setClientId(val || null)}
          disabled={isLoadingClients}
        >
          <SelectTrigger className="w-[200px] shrink-0">
            <SelectValue placeholder={isLoadingClients ? 'Cargando...' : 'Cliente'}>
              {selectedClient && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: getClientColor(selectedClient.id) }}
                  >
                    {getInitials(selectedClient.nombre_del_negocio)}
                  </div>
                  <span className="truncate">{selectedClient.nombre_del_negocio}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {clientes.map((cliente) => (
              <SelectItem key={cliente.id} value={cliente.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: getClientColor(cliente.id) }}
                  >
                    {getInitials(cliente.nombre_del_negocio)}
                  </div>
                  <span>{cliente.nombre_del_negocio}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Facturable */}
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
          title={billable ? 'Facturable' : 'No facturable'}
        >
          <DollarSign className="h-4 w-4" />
        </Button>

        {/* Timer display */}
        <div className="font-mono text-xl font-semibold tabular-nums w-24 text-right shrink-0">
          {isRunning
            ? formatDuration(elapsedSeconds)
            : lastEntry
              ? formatDurationShort(lastEntry.duracion_seg)
              : '00:00:00'}
        </div>

        {/* Start/Stop */}
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
