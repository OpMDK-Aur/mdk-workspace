'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Loader2, CheckCircle2, Clock, Circle, Ban, ExternalLink, ChevronLeft, ChevronRight, ClipboardCheck, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateMonthInstances, getClientServiceMap, completeInstance } from '@/lib/service-map'
import type { MapaServicioInstancia, ClientPlan, HitoCatalogo, EstadoInstancia, ChecklistItem, ChecklistItemSnapshot } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ClientServiceMapProps {
  clientId: string
  clientPlan: ClientPlan
  currentUserId?: string | null
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const ESTADO_CONFIG: Record<EstadoInstancia, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pendiente: { icon: Circle, color: 'text-muted-foreground', label: 'Pendiente' },
  en_curso: { icon: Clock, color: 'text-amber-500', label: 'En curso' },
  listo: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completado' },
  no_aplica: { icon: Ban, color: 'text-muted-foreground/50', label: 'No aplica' },
  no_realizado: { icon: XCircle, color: 'text-red-500', label: 'No realizado' },
}

export function ClientServiceMap({ clientId, clientPlan, currentUserId }: ClientServiceMapProps) {
  const [instances, setInstances] = useState<MapaServicioInstancia[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal state for completing hitos directly
  const [completingInstance, setCompletingInstance] = useState<MapaServicioInstancia | null>(null)
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({})
  const [linkDrive, setLinkDrive] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Current month/year state
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // Generate years for selector (current year -1 to +1)
  const years = useMemo(() => {
    const currentYear = now.getFullYear()
    return [currentYear - 1, currentYear, currentYear + 1]
  }, [])

  // Fetch instances for selected month
  useEffect(() => {
    const supabase = createClient()

    async function fetchAndGenerate() {
      setLoading(true)
      setError(null)

      try {
        const { data: catalogCheck, error: catalogError } = await supabase
          .from('hitos_catalogo')
          .select('id')
          .limit(1)
        
        if (catalogError) {
          setError(`Error accediendo al catálogo: ${catalogError.message}`)
          setLoading(false)
          return
        }
        
        if (!catalogCheck || catalogCheck.length === 0) {
          setError('El catálogo de hitos está vacío. Por favor, agregue los hitos en la configuración.')
          setLoading(false)
          return
        }

        const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()
        if (isCurrentMonth) {
          setGenerating(true)
          const genResult = await generateMonthInstances(clientId, selectedMonth, selectedYear, clientPlan)
          if (!genResult.success) {
            setError(`Error generando: ${genResult.error}`)
          }
          setGenerating(false)
        }

        const result = await getClientServiceMap(clientId, selectedMonth, selectedYear, clientPlan)
        if (result.error) {
          setError(result.error)
        } else {
          setInstances(result.data || [])
        }
      } catch (e) {
        setError(`Error: ${e instanceof Error ? e.message : String(e)}`)
      }

      setLoading(false)
    }

    fetchAndGenerate()

    // Subscribe to realtime changes on mapa_servicio_instancias for this client
    const channel = supabase
      .channel(`service_map_${clientId}_${selectedMonth}_${selectedYear}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mapa_servicio_instancias',
          filter: `cliente_id=eq.${clientId}`,
        },
        () => {
          // Refetch when any instance is updated
          fetchAndGenerate()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clientId, clientPlan, selectedMonth, selectedYear])

  // Group instances by hito (some hitos have multiple instances per month)
  const groupedByHito = useMemo(() => {
    const groups = new Map<string, MapaServicioInstancia[]>()
    
    for (const instance of instances) {
      const hitoId = instance.hito_id
      if (!groups.has(hitoId)) {
        groups.set(hitoId, [])
      }
      groups.get(hitoId)!.push(instance)
    }

    // Sort by hito orden
    return Array.from(groups.entries())
      .sort((a, b) => {
        const hitoA = a[1][0]?.hito as HitoCatalogo | undefined
        const hitoB = b[1][0]?.hito as HitoCatalogo | undefined
        return (hitoA?.orden ?? 0) - (hitoB?.orden ?? 0)
      })
  }, [instances])

  // Calculate progress
  const progress = useMemo(() => {
    if (instances.length === 0) return 0
    const completed = instances.filter((i) => i.estado === 'listo').length
    return Math.round((completed / instances.length) * 100)
  }, [instances])

  // Navigation handlers
  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear(selectedYear - 1)
    } else {
      setSelectedMonth(selectedMonth - 1)
    }
  }

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear(selectedYear + 1)
    } else {
      setSelectedMonth(selectedMonth + 1)
    }
  }

  const goToCurrentMonth = () => {
    setSelectedMonth(now.getMonth() + 1)
    setSelectedYear(now.getFullYear())
  }

  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()

  // Get checklist items for the hito based on client plan
  const getChecklistItems = useCallback((hito: HitoCatalogo): ChecklistItem[] => {
    const normalizedPlan = clientPlan.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (normalizedPlan === 'estrategico' && hito.checklist_estrategico?.length) {
      return hito.checklist_estrategico
    }
    return hito.checklist_esencial || []
  }, [clientPlan])

  // Open completion modal for an instance
  const openCompletionModal = (instance: MapaServicioInstancia) => {
    const hito = instance.hito as HitoCatalogo | undefined
    if (!hito) return

    const items = getChecklistItems(hito)
    const initialState: Record<string, boolean> = {}
    items.forEach(item => {
      initialState[item.id] = false
    })
    
    setChecklistState(initialState)
    setLinkDrive('')
    setCompletingInstance(instance)
  }

  // Handle checklist item toggle
  const toggleChecklistItem = (itemId: string) => {
    setChecklistState(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }))
  }

  // Submit completion
  const handleCompleteHito = async () => {
    if (!completingInstance || !currentUserId) return

    const hito = completingInstance.hito as HitoCatalogo | undefined
    if (!hito) return

    setIsSubmitting(true)

    try {
      const items = getChecklistItems(hito)
      const checklistSnapshot: ChecklistItemSnapshot[] = items.map(item => ({
        id: item.id,
        texto: item.texto,
        completado: checklistState[item.id] || false
      }))
      
      const allChecked = Object.values(checklistState).every(v => v)

      const result = await completeInstance(
        completingInstance.id,
        currentUserId,
        checklistSnapshot,
        allChecked,
        hito.requiere_link_drive ? linkDrive : undefined,
        clientId
      )

      if (!result.success) {
        throw new Error(result.error || 'Error al completar')
      }

      // Refresh instances
      const refreshResult = await getClientServiceMap(clientId, selectedMonth, selectedYear, clientPlan)
      if (refreshResult.data) {
        setInstances(refreshResult.data)
      }

      setCompletingInstance(null)
    } catch (e) {
      console.error('[service-map] Error completing instance:', e)
      alert(`Error: ${e instanceof Error ? e.message : 'Error desconocido'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          {generating ? 'Generando hitos del mes...' : 'Cargando mapa de servicio...'}
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center">
        <p className="text-sm text-destructive font-medium">{error}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Si este error persiste, contacte al administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with month selector and progress */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPreviousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[130px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[90px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {!isCurrentMonth && (
            <Button variant="outline" size="sm" className="h-8 text-xs ml-2" onClick={goToCurrentMonth}>
              Hoy
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {instances.filter((i) => i.estado === 'listo').length}/{instances.length} completados
          </div>
          <div className="w-32">
            <Progress value={progress} className="h-2" />
          </div>
          <span className="text-sm font-medium">{progress}%</span>
        </div>
      </div>

      {/* Empty state */}
      {groupedByHito.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No hay hitos para este mes.</p>
          {!isCurrentMonth && (
            <p className="text-xs mt-1">Los hitos se generan automáticamente al visualizar el mes actual.</p>
          )}
        </div>
      )}

      {/* Hitos list */}
      <TooltipProvider>
        <div className="space-y-2">
          {groupedByHito.map(([hitoId, hitoInstances]) => {
            const hito = hitoInstances[0]?.hito as HitoCatalogo | undefined
            if (!hito) return null

            // Count completed instances for this hito
            const completedCount = hitoInstances.filter((i) => i.estado === 'listo').length
            const totalCount = hitoInstances.length
            const allCompleted = completedCount === totalCount

            // Get the first non-completed instance for status display
            const primaryInstance = hitoInstances.find((i) => i.estado !== 'listo') || hitoInstances[0]
            const estadoConfig = ESTADO_CONFIG[primaryInstance.estado]
            const IconComponent = estadoConfig.icon

            return (
              <div
                key={hitoId}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                  allCompleted ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card hover:bg-muted/50'
                )}
              >
                {/* Status icon */}
                <div className="mt-0.5">
                  <Tooltip>
                    <TooltipTrigger>
                      <IconComponent className={cn('h-5 w-5', estadoConfig.color)} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{estadoConfig.label}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-medium leading-tight">{hito.nombre}</h4>
                      {hito.descripcion && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {hito.descripcion}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Frequency badge */}
                      <Badge variant="outline" className="text-[10px] h-5">
                        {hito.frecuencia}
                      </Badge>

                      {/* Progress for multi-instance hitos */}
                      {totalCount > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {completedCount}/{totalCount}
                        </span>
                      )}

                      {/* Link to drive if exists */}
                      {primaryInstance.link_drive && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={primaryInstance.link_drive}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Ver en Drive</p>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {/* Complete button - only for hitos without linked task and not completed */}
                      {!primaryInstance.tarea_id && primaryInstance.estado !== 'listo' && currentUserId && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-emerald-500"
                              onClick={() => openCompletionModal(primaryInstance)}
                            >
                              <ClipboardCheck className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Marcar como completado</p>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {/* Indicator if has linked task */}
                      {primaryInstance.tarea_id && primaryInstance.estado !== 'listo' && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[10px] h-5 bg-blue-500/10 text-blue-500 border-blue-500/30">
                              Tarea
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Este hito se completa resolviendo la tarea vinculada</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Multi-instance indicators (weekly hitos) */}
                  {totalCount > 1 && (
                    <div className="flex items-center gap-1 mt-2">
                      {hitoInstances.map((instance, idx) => {
                        const instEstado = ESTADO_CONFIG[instance.estado]
                        return (
                          <Tooltip key={instance.id}>
                            <TooltipTrigger>
                              <div
                                className={cn(
                                  'w-6 h-6 rounded flex items-center justify-center text-[10px] font-medium border',
                                  instance.estado === 'listo'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                                    : 'bg-muted border-border text-muted-foreground'
                                )}
                              >
                                S{instance.semana_del_mes || idx + 1}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                Semana {instance.semana_del_mes || idx + 1}: {instEstado.label}
                              </p>
                              {instance.fecha_completado && (
                                <p className="text-xs text-muted-foreground">
                                  Completado: {new Date(instance.fecha_completado).toLocaleDateString('es-AR')}
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })}
                    </div>
                  )}

                  {/* Completion info for single-instance hitos */}
                  {totalCount === 1 && primaryInstance.fecha_completado && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Completado: {new Date(primaryInstance.fecha_completado).toLocaleDateString('es-AR')}
                      {primaryInstance.checklist_completo === false && (
                        <span className="text-amber-500 ml-2">- Checklist incompleto</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </TooltipProvider>

      {/* Completion Modal */}
      <Dialog open={!!completingInstance} onOpenChange={(open) => !open && setCompletingInstance(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Completar Hito
            </DialogTitle>
            <DialogDescription>
              {(completingInstance?.hito as HitoCatalogo)?.nombre}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Checklist items */}
            {completingInstance && (() => {
              const hito = completingInstance.hito as HitoCatalogo | undefined
              if (!hito) return null
              const items = getChecklistItems(hito)

              if (items.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Este hito no tiene checklist configurado.
                  </p>
                )
              }

              return (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Checklist</Label>
                  {items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <Checkbox
                        id={item.id}
                        checked={checklistState[item.id] || false}
                        onCheckedChange={() => toggleChecklistItem(item.id)}
                      />
                      <label
                        htmlFor={item.id}
                        className={cn(
                          "text-sm cursor-pointer leading-tight",
                          checklistState[item.id] && "text-muted-foreground line-through"
                        )}
                      >
                        {item.texto}
                      </label>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Link Drive field if required */}
            {completingInstance && (completingInstance.hito as HitoCatalogo)?.requiere_link_drive && (
              <div className="space-y-2">
                <Label htmlFor="link-drive" className="text-sm font-medium">
                  Link de Google Drive <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="link-drive"
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={linkDrive}
                  onChange={(e) => setLinkDrive(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Este hito requiere un enlace de Drive para ser completado.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCompletingInstance(null)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCompleteHito}
              disabled={
                isSubmitting ||
                ((completingInstance?.hito as HitoCatalogo)?.requiere_link_drive && !linkDrive)
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Completando...
                </>
              ) : (
                'Marcar como completado'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
