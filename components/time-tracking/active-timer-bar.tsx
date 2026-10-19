'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTimerStore } from '@/lib/time-tracking/timer-store'
import { formatDuration, formatDurationShort } from '@/lib/time-tracking/mock-data'
import { createClient } from '@/lib/supabase/client'
import type { Cliente, TipoDeTarea } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchCombobox, normalizeSearch } from '@/components/time-tracking/search-combobox'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Play, Square, DollarSign, Loader2, Building2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  formatMissingTimerFields,
  getMissingTimerFields,
  TimerValidationError,
} from '@/lib/time-tracking/validate-timer'

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
  departamento_id: string | null
}

export function ActiveTimerBar() {
  const router = useRouter()
  const {
    isRunning,
    startedAt,
    description,
    clientId,
    billable,
    tipoTareaId,
    startTimer,
    stopTimer,
    setDescription,
    setClientId,
    setTipoTareaId,
    toggleBillable,
    getElapsedSeconds,
    loadEntries,
    showValidationErrors,
  } = useTimerStore()

  const entries = useTimerStore((s) => s.entries)
  const splitClientIds = useTimerStore((s) => s.splitClientIds)
  const [clientes, setClientes] = useState<Pick<Cliente, 'id' | 'nombre_del_negocio'>[]>([])
  const [tiposTarea, setTiposTarea] = useState<Pick<TipoDeTarea, 'id' | 'nombre' | 'color'>[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const [colaborador, setColaborador] = useState<ColaboradorInfo | null>(null)
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [isLoadingTipos, setIsLoadingTipos] = useState(true)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  useEffect(() => {
    // Rehydrate store from localStorage before any other operations
    useTimerStore.persist.rehydrate()
    
    async function loadClientes() {
      const { data, error } = await createClient()
        .from('clientes')
        .select('id, nombre_del_negocio')
        .order('nombre_del_negocio')
      if (!error && data) setClientes(data)
      setIsLoadingClients(false)
    }

    async function init() {
      const supabase = createClient()
      const clientesPromise = loadClientes()
      // The bar only needs the running entry and recent ones (for "recientes"); the full history loads on /dashboard/time.
      const entriesPromise = loadEntries({ limit: 200 })

      // Local session read: avoids a network round trip to the auth server on every page load.
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user ?? null

      if (user) {
        // Obtener colaborador con su departamento
        const { data: colab } = await supabase
          .from('colaboradores')
          .select('nombre, departamento_id, departamentos(id, nombre)')
          .eq('id', user.id)
          .single()

        let deptoId: string | null = null
        if (colab) {
          const dept = (colab.departamentos as { id: string; nombre: string } | null)
          deptoId = colab.departamento_id ?? null
          setColaborador({
            nombre: colab.nombre,
            departamento: dept?.nombre ?? null,
            departamento_id: deptoId,
          })
        }

        // Cargar tipos de tarea: los genéricos (sin departamento) + los del departamento del usuario
        const { data: tipos } = await supabase
          .from('tipo_de_tareas')
          .select('id, nombre, color')
          .eq('activo', true)
          .or(deptoId ? `departamento_id.is.null,departamento_id.eq.${deptoId}` : 'departamento_id.is.null')
          .order('nombre')
        
        if (tipos) setTiposTarea(tipos)
      }
      setIsLoadingTipos(false)

      await Promise.all([clientesPromise, entriesPromise])
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

  const clientOptions = useMemo(
    () => clientes.map((c) => ({ id: c.id, label: c.nombre_del_negocio })),
    [clientes],
  )
  const splitClients = useMemo(() => {
    if (!splitClientIds || splitClientIds.length < 2) return []
    const byId = new Map(clientOptions.map((c) => [c.id, c]))
    return splitClientIds.map((id) => byId.get(id) ?? { id, label: 'Cliente' })
  }, [splitClientIds, clientOptions])
  const tipoOptions = useMemo(
    () => tiposTarea.map((t) => ({ id: t.id, label: t.nombre, color: t.color })),
    [tiposTarea],
  )
  const { recentClientIds, recentTipoIds } = useMemo(() => {
    const clients = new Set<string>()
    const tipos = new Set<string>()
    for (const e of entries) {
      if (e.cliente_id && clients.size < 5) clients.add(e.cliente_id)
      if (e.tipo_tarea_id && tipos.size < 5) tipos.add(e.tipo_tarea_id)
      if (clients.size >= 5 && tipos.size >= 5) break
    }
    return { recentClientIds: [...clients], recentTipoIds: [...tipos] }
  }, [entries])
  const headerSearchResults = useMemo(() => {
    const q = normalizeSearch(clientSearch)
    if (!q) return []
    return clientes.filter((c) => normalizeSearch(c.nombre_del_negocio).includes(q)).slice(0, 8)
  }, [clientes, clientSearch])

  const missingFields = isRunning ? [] : getMissingTimerFields({ description, tipoTareaId, clientId })
  const canStart = missingFields.length === 0
  const showErrors = showValidationErrors && !canStart
  const isMissing = (field: (typeof missingFields)[number]) => showErrors && missingFields.includes(field)
  const errorRing = 'border-destructive ring-1 ring-destructive'

  const handleStart = async () => {
    if (!canStart) {
      useTimerStore.setState({ showValidationErrors: true })
      toast.error(formatMissingTimerFields(missingFields))
      return
    }
    setIsStarting(true)
    try {
      await startTimer()
      toast.success('Timer iniciado')
    } catch (error) {
      if (error instanceof TimerValidationError) {
        toast.error(formatMissingTimerFields(error.missing))
      } else {
        toast.error('Error al iniciar el timer')
      }
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
      {/* Fila superior: departamento + buscador de clientes */}
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

          {/* Separador */}
          <div className="h-4 w-px bg-border mx-1" />

          {/* Buscador de clientes */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => { setClientSearch(e.target.value); setClientSearchOpen(true) }}
              onFocus={() => setClientSearchOpen(true)}
              onBlur={() => setTimeout(() => setClientSearchOpen(false), 150)}
              className="h-6 w-full rounded-md border border-border bg-muted/40 pl-7 pr-6 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors"
            />
            {clientSearch && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setClientSearch(''); setClientSearchOpen(false) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {/* Dropdown de resultados */}
            {clientSearchOpen && clientSearch.trim() && (
              <div className="absolute top-full left-0 mt-1 w-72 rounded-md border border-border bg-popover shadow-lg z-50 overflow-hidden">
                {headerSearchResults.map(cliente => (
                    <button
                      key={cliente.id}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        router.push(`/dashboard/clients/${cliente.id}`)
                        setClientSearch('')
                        setClientSearchOpen(false)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                    >
                      <div
                        className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: getClientColor(cliente.id) }}
                      >
                        {getInitials(cliente.nombre_del_negocio)}
                      </div>
                      <span className="truncate">{cliente.nombre_del_negocio}</span>
                    </button>
                  ))
                }
                {headerSearchResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fila principal: timer */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Descripción */}
        <div className="flex-1 min-w-0">
          <Input
            placeholder="¿En qué estás trabajando?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-invalid={isMissing('description') || undefined}
            aria-required
            className={cn(
              'bg-transparent text-base shadow-none focus-visible:ring-0',
              isMissing('description') ? `${errorRing} px-2` : 'border-0 px-0'
            )}
          />
        </div>

        <SearchCombobox
          options={tipoOptions}
          value={tipoTareaId}
          onChange={(id) => void setTipoTareaId(id)}
          placeholder={isLoadingTipos ? 'Cargando...' : 'Tipo de tarea'}
          searchPlaceholder="Buscar tipo de tarea..."
          disabled={isLoadingTipos}
          invalid={isMissing('tipo')}
          recentIds={recentTipoIds}
          className="w-[110px] sm:w-[180px] shrink"
          renderOption={(tipo) => (
            <>
              {tipo.color && (
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tipo.color }} />
              )}
              <span className="truncate">{tipo.label}</span>
            </>
          )}
        />

        {splitClients.length > 1 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-[110px] sm:w-[180px] shrink items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent"
                aria-label={`Tiempo dividido entre ${splitClients.map((c) => c.label).join(', ')}`}
              >
                <span className="flex -space-x-1.5 shrink-0">
                  {splitClients.slice(0, 3).map((c) => (
                    <span
                      key={c.id}
                      className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white ring-2 ring-background"
                      style={{ backgroundColor: getClientColor(c.id) }}
                    >
                      {getInitials(c.label)}
                    </span>
                  ))}
                </span>
                <span className="truncate">{splitClients.length} clientes</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <p className="px-2 pb-2 text-xs text-muted-foreground leading-relaxed">
                El tiempo se divide en partes iguales al detener el timer.
              </p>
              <ul className="flex flex-col">
                {splitClients.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void setClientId(c.id)}
                      className="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <span
                        className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                        style={{ backgroundColor: getClientColor(c.id) }}
                      >
                        {getInitials(c.label)}
                      </span>
                      <span className="flex-1 truncate text-left">{c.label}</span>
                      <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">Solo este</span>
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        ) : (
        <SearchCombobox
          options={clientOptions}
          value={clientId}
          onChange={(id) => void setClientId(id)}
          placeholder={isLoadingClients ? 'Cargando...' : 'Cliente'}
          searchPlaceholder="Buscar cliente..."
          disabled={isLoadingClients}
          invalid={isMissing('cliente')}
          recentIds={recentClientIds}
          className="w-[110px] sm:w-[180px] shrink"
          renderOption={(cliente) => (
            <>
              <span
                className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                style={{ backgroundColor: getClientColor(cliente.id) }}
              >
                {getInitials(cliente.label)}
              </span>
              <span className="truncate">{cliente.label}</span>
            </>
          )}
        />
        )}

        {/* Controles fijos: siempre visibles, nunca se achican ni se cortan */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
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
            {isRunning ? formatDuration(elapsedSeconds) : '00:00:00'}
          </div>

          {/* Start/Stop */}
          <Button
            onClick={isRunning ? handleStop : handleStart}
            size="icon"
            disabled={isStarting || isStopping}
            aria-disabled={!isRunning && !canStart}
            aria-label={isRunning ? 'Detener timer' : canStart ? 'Iniciar timer' : formatMissingTimerFields(missingFields)}
            title={!isRunning && !canStart ? formatMissingTimerFields(missingFields) : undefined}
            className={cn(
              'shrink-0 h-10 w-10 rounded-full border-0 text-white',
              isRunning
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700',
              !isRunning && !canStart && 'opacity-50 cursor-not-allowed hover:bg-emerald-600'
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
      {showErrors && (
        <p role="alert" className="px-4 pb-2 -mt-1 text-xs text-destructive">
          {formatMissingTimerFields(missingFields)}
        </p>
      )}
    </div>
  )
}
