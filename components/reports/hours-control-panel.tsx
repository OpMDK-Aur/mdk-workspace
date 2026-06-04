'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Users, Building2, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface MetricaColaborador {
  id: string
  colaborador_id: string
  cliente_id: string
  minimo_no_negociable_horas: number | null
  horas_objetivo: number | null
  acumulado_mes_asignado: number | null
  mes: number
  anio: number
  colaborador: {
    id: string
    nombre: string
    apellido: string | null
  } | null
  cliente: {
    id: string
    nombre_del_negocio: string
  } | null
}

interface HoursStatus {
  status: 'ok' | 'warning' | 'danger' | 'no-limits'
  message: string
}

function getHoursStatus(
  asignadas: number,
  minimo: number,
  maximo: number
): HoursStatus {
  // If no limits defined, return neutral status
  if (minimo === 0 && maximo === 0) {
    return {
      status: 'no-limits',
      message: 'Sin límites definidos',
    }
  }
  if (asignadas < minimo) {
    return {
      status: 'danger',
      message: `Faltan ${(minimo - asignadas).toFixed(1)}h para el mínimo`,
    }
  }
  if (asignadas > maximo) {
    return {
      status: 'danger',
      message: `Excede ${(asignadas - maximo).toFixed(1)}h el máximo`,
    }
  }
  if (asignadas >= maximo * 0.9) {
    return {
      status: 'warning',
      message: `Cerca del límite máximo (${((asignadas / maximo) * 100).toFixed(0)}%)`,
    }
  }
  if (asignadas < minimo * 1.1) {
    return {
      status: 'warning',
      message: `Cerca del mínimo (${((asignadas / minimo) * 100).toFixed(0)}%)`,
    }
  }
  return {
    status: 'ok',
    message: 'Dentro del rango permitido',
  }
}

function StatusBadge({ status }: { status: HoursStatus }) {
  if (status.status === 'no-limits') {
    return (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
        <Clock className="w-3 h-3 mr-1" />
        S/L
      </Badge>
    )
  }
  if (status.status === 'ok') {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        OK
      </Badge>
    )
  }
  if (status.status === 'warning') {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Atencion
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
      <XCircle className="w-3 h-3 mr-1" />
      Fuera de rango
    </Badge>
  )
}

function StatusIcon({ status }: { status: 'ok' | 'warning' | 'danger' | 'no-limits' }) {
  if (status === 'no-limits') {
    return <Clock className="w-4 h-4 text-blue-500" />
  }
  if (status === 'ok') {
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
  }
  if (status === 'warning') {
    return <AlertTriangle className="w-4 h-4 text-amber-500" />
  }
  return <XCircle className="w-4 h-4 text-red-500" />
}

// Format hours (decimal) to HH:MM:SS
function formatHoursToTime(hours: number): string {
  const totalSeconds = Math.round(hours * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Calculate expected hours at current date to be on track for minimum
interface PaceStatus {
  expectedHours: number
  difference: number // positive = ahead, negative = behind
  percentComplete: number // % of month elapsed
  status: 'ahead' | 'on-track' | 'behind'
  message: string
}

function calculatePaceStatus(
  asignado: number,
  minimo: number,
  selectedMonth: number,
  selectedYear: number
): PaceStatus {
  const today = new Date()
  const currentDay = today.getDate()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()
  
  // Get total days in the selected month
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()
  
  // If viewing a past month, consider it 100% complete
  const isPastMonth = selectedYear < currentYear || 
    (selectedYear === currentYear && selectedMonth < currentMonth)
  
  // If viewing a future month, 0% complete
  const isFutureMonth = selectedYear > currentYear || 
    (selectedYear === currentYear && selectedMonth > currentMonth)
  
  let dayOfMonth: number
  if (isPastMonth) {
    dayOfMonth = daysInMonth // Full month elapsed
  } else if (isFutureMonth) {
    dayOfMonth = 0 // Month hasn't started
  } else {
    dayOfMonth = currentDay // Current day of the month
  }
  
  const percentComplete = (dayOfMonth / daysInMonth) * 100
  const expectedHours = minimo * (dayOfMonth / daysInMonth)
  const difference = asignado - expectedHours
  
  // Tolerance: consider "on-track" if within 10% of expected
  const tolerance = expectedHours * 0.1
  
  let status: 'ahead' | 'on-track' | 'behind'
  let message: string
  
  if (isFutureMonth) {
    status = 'on-track'
    message = 'Mes futuro'
  } else if (difference > tolerance) {
    status = 'ahead'
    message = `+${formatHoursToTime(difference)} adelantado`
  } else if (difference < -tolerance) {
    status = 'behind'
    message = `${formatHoursToTime(Math.abs(difference))} atrasado`
  } else {
    status = 'on-track'
    message = 'En ritmo'
  }
  
  return {
    expectedHours,
    difference,
    percentComplete,
    status,
    message,
  }
}

// Pace indicator component
function PaceIndicator({ 
  asignado, 
  minimo,
  selectedMonth,
  selectedYear,
}: { 
  asignado: number
  minimo: number
  selectedMonth: number
  selectedYear: number
}) {
  const pace = calculatePaceStatus(asignado, minimo, selectedMonth, selectedYear)
  
  if (minimo === 0) return null
  
  const iconClass = "w-3 h-3"
  const containerClass = "flex items-center gap-1 text-xs"
  
  if (pace.status === 'ahead') {
    return (
      <div className={`${containerClass} text-emerald-500`}>
        <TrendingUp className={iconClass} />
        <span>{pace.message}</span>
      </div>
    )
  }
  
  if (pace.status === 'behind') {
    return (
      <div className={`${containerClass} text-red-500`}>
        <TrendingDown className={iconClass} />
        <span>{pace.message}</span>
      </div>
    )
  }
  
  return (
    <div className={`${containerClass} text-muted-foreground`}>
      <Minus className={iconClass} />
      <span>{pace.message}</span>
    </div>
  )
}

// Custom progress bar with min/max markers and color logic
// - Gray: 0 to min (below minimum)
// - Green: min to max (within range)
// - Red: exceeds max (over limit)
// - Blue: no limits defined (just shows hours)
function HoursProgressBar({ 
  asignado, 
  minimo, 
  maximo,
  height = 'h-3'
}: { 
  asignado: number
  minimo: number
  maximo: number
  height?: string
}) {
  const hasLimits = minimo > 0 || maximo > 0
  
  // If no limits defined, show a simple display
  if (!hasLimits) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className={`relative flex-1 ${height} bg-zinc-800 rounded-full overflow-hidden`}>
            <div 
              className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-300 rounded-full"
              style={{ width: '100%' }}
            />
          </div>
          <span className="text-sm font-mono font-medium min-w-[70px] text-right text-blue-500">
            {formatHoursToTime(asignado)}
          </span>
          <span className="text-xs font-medium min-w-[45px] text-right text-muted-foreground">
            (S/L)
          </span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Sin límites definidos</span>
        </div>
      </div>
    )
  }
  
  // Calculate percentages relative to max
  const minPercent = maximo > 0 ? (minimo / maximo) * 100 : 50
  const progressPercent = maximo > 0 ? (asignado / maximo) * 100 : 0
  const isOverMax = asignado > maximo
  const isAtOrAboveMin = asignado >= minimo
  
  // Determine color based on progress
  const getProgressColor = () => {
    if (isOverMax) return 'bg-red-500'
    if (isAtOrAboveMin) return 'bg-emerald-500'
    return 'bg-zinc-400'
  }

  return (
    <div className="space-y-1">
      {/* Progress bar with accumulated at the end */}
      <div className="flex items-center gap-3">
        <div className={`relative flex-1 ${height} bg-zinc-800 rounded-full overflow-hidden`}>
          {/* Progress fill */}
          <div 
            className={`absolute inset-y-0 left-0 ${getProgressColor()} transition-all duration-300 rounded-full`}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
          {/* Min marker */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-white/60"
            style={{ left: `${minPercent}%` }}
          />
        </div>
        {/* Accumulated hours at the end */}
        <span className={`text-sm font-mono font-medium min-w-[70px] text-right ${
          isOverMax ? 'text-red-500' : isAtOrAboveMin ? 'text-emerald-500' : 'text-zinc-400'
        }`}>
          {formatHoursToTime(asignado)}
        </span>
        <span className={`text-xs font-medium min-w-[45px] text-right ${
          isOverMax ? 'text-red-500' : isAtOrAboveMin ? 'text-emerald-500' : 'text-zinc-400'
        }`}>
          ({progressPercent.toFixed(0)}%)
        </span>
      </div>
      {/* Min at start, Max at end - below the bar */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Mín: <span className="font-mono">{formatHoursToTime(minimo)}</span></span>
        <span>Máx: <span className="font-mono">{formatHoursToTime(maximo)}</span></span>
      </div>
    </div>
  )
}

// Compact progress bar for table rows
function CompactProgressBar({ 
  asignado, 
  minimo, 
  maximo 
}: { 
  asignado: number
  minimo: number
  maximo: number
}) {
  const hasLimits = minimo > 0 || maximo > 0
  
  // If no limits defined, show a simple display
  if (!hasLimits) {
    return (
      <div className="flex items-center gap-2 min-w-[200px]">
        <div className="relative flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-300 rounded-full"
            style={{ width: '100%' }}
          />
        </div>
        <span className="text-xs font-mono font-medium min-w-[60px] text-right text-blue-500">
          {formatHoursToTime(asignado)}
        </span>
        <span className="text-xs font-medium min-w-[40px] text-right text-muted-foreground">
          (S/L)
        </span>
      </div>
    )
  }
  
  const minPercent = maximo > 0 ? (minimo / maximo) * 100 : 50
  const progressPercent = maximo > 0 ? (asignado / maximo) * 100 : 0
  const isOverMax = asignado > maximo
  const isAtOrAboveMin = asignado >= minimo
  
  const getProgressColor = () => {
    if (isOverMax) return 'bg-red-500'
    if (isAtOrAboveMin) return 'bg-emerald-500'
    return 'bg-zinc-400'
  }

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <div className="relative flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className={`absolute inset-y-0 left-0 ${getProgressColor()} transition-all duration-300 rounded-full`}
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        />
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white/50"
          style={{ left: `${minPercent}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-medium min-w-[60px] text-right ${
        isOverMax ? 'text-red-500' : isAtOrAboveMin ? 'text-emerald-500' : 'text-zinc-400'
      }`}>
        {formatHoursToTime(asignado)}
      </span>
      <span className={`text-xs font-medium min-w-[40px] text-right ${
        isOverMax ? 'text-red-500' : isAtOrAboveMin ? 'text-emerald-500' : 'text-zinc-400'
      }`}>
        ({progressPercent.toFixed(0)}%)
      </span>
    </div>
  )
}

async function fetchMetricas(mes: number, anio: number) {
  const supabase = createClient()
  
  // Calculate the date range for the selected month
  const startDate = new Date(anio, mes - 1, 1)
  const endDate = new Date(anio, mes, 0) // Last day of the month
  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]
  
  // Fetch metricas_colaboradores - this is the single source of truth
  // Values (horas_objetivo, minimo_no_negociable_horas) are pre-calculated and stored by the Colaboradores page
  const [metricasRes, colaboradoresRes, clientesRes] = await Promise.all([
    supabase
      .from('metricas_colaborador')
      .select(`
        *,
        colaborador:colaborador_id(id, nombre, apellido),
        cliente:cliente_id(id, nombre_del_negocio)
      `)
      .eq('mes', mes)
      .eq('anio', anio),
    supabase.from('colaboradores').select('id, nombre, apellido, email'),
    supabase.from('clientes').select('id, nombre_del_negocio'),
  ])
  
  // Fetch entries in multiple pages to bypass Supabase 1000 row limit
  const allEntries: { colaborador_id: string; cliente_id: string; duracion_seg: number }[] = []
  let page = 0
  const pageSize = 1000
  let hasMore = true
  
  while (hasMore) {
    const { data: pageData, error: pageError } = await supabase
      .from('entradas_de_tiempo')
      .select('colaborador_id, cliente_id, duracion_seg')
      .gte('iniciado_en', `${startDateStr}T00:00:00`)
      .lte('iniciado_en', `${endDateStr}T23:59:59`)
      .range(page * pageSize, (page + 1) * pageSize - 1)
    
    if (pageError) throw pageError
    
    if (pageData && pageData.length > 0) {
      allEntries.push(...pageData)
      hasMore = pageData.length === pageSize
      page++
    } else {
      hasMore = false
    }
  }
  
  if (metricasRes.error) throw metricasRes.error
  
  const metricas = metricasRes.data || []
  const entries = allEntries
  const colaboradoresMap = new Map((colaboradoresRes.data || []).map(c => [c.id, c]))
  const clientesMap = new Map((clientesRes.data || []).map(c => [c.id, c]))
  
  console.log('[v0] fetchMetricas debug:', {
    entriesCount: entries.length,
    colaboradoresCount: colaboradoresMap.size,
    clientesCount: clientesMap.size,
    dateRange: { startDateStr, endDateStr },
    sampleEntries: entries.slice(0, 3).map(e => ({ colaborador_id: e.colaborador_id, cliente_id: e.cliente_id, duracion_seg: e.duracion_seg })),
    uniqueColaboradorIdsInEntries: [...new Set(entries.map(e => e.colaborador_id))],
    colaboradoresIds: [...colaboradoresMap.keys()],
  })
  
  // Calculate hours per colaborador-cliente pair from time entries
  const hoursMap = new Map<string, number>()
  entries.forEach(entry => {
    if (entry.colaborador_id && entry.cliente_id && entry.duracion_seg) {
      const key = `${entry.colaborador_id}::${entry.cliente_id}`
      hoursMap.set(key, (hoursMap.get(key) || 0) + (entry.duracion_seg / 3600))
    }
  })
  
  // Create a set of existing metrica keys
  const metricaKeys = new Set(metricas.map(m => `${m.colaborador_id}::${m.cliente_id}`))
  
  // Use metricas directly from DB - values are already calculated and stored
  const metricasWithHours: MetricaColaborador[] = metricas.map(m => ({
    ...m,
    minimo_no_negociable_horas: Number(m.minimo_no_negociable_horas) || 0,
    horas_objetivo: Number(m.horas_objetivo) || 0,
    acumulado_mes_asignado: hoursMap.get(`${m.colaborador_id}::${m.cliente_id}`) || 0
  }))
  
  // Add entries that don't have metricas (time tracked but no assignment defined)
  hoursMap.forEach((hours, key) => {
    if (!metricaKeys.has(key)) {
      const [colaborador_id, cliente_id] = key.split('::')
      const colaborador = colaboradoresMap.get(colaborador_id)
      const cliente = clientesMap.get(cliente_id)
      
      if (!colaborador || !cliente) {
        console.log('[v0] Skipped entry - no match:', { colaborador_id, cliente_id, hasColaborador: !!colaborador, hasCliente: !!cliente, hours })
      }
      
      if (colaborador && cliente) {
        metricasWithHours.push({
          id: `generated-${key}`,
          colaborador_id,
          cliente_id,
          minimo_no_negociable_horas: null,
          horas_objetivo: null,
          acumulado_mes_asignado: hours,
          mes,
          anio,
          colaborador: {
            id: colaborador.id,
            nombre: colaborador.nombre,
            apellido: colaborador.apellido,
          },
          cliente: {
            id: cliente.id,
            nombre_del_negocio: cliente.nombre_del_negocio,
          },
        })
      }
    }
  })
  
  return metricasWithHours as MetricaColaborador[]
}

interface HoursControlPanelProps {
  month: number
  year: number
  colaboradorId?: string
  clienteId?: string
}

export function HoursControlPanel({ 
  month: selectedMonth, 
  year: selectedYear,
  colaboradorId,
  clienteId,
}: HoursControlPanelProps) {
  // Use props for filtering instead of local state
  const filterColaborador = colaboradorId || 'all'
  const filterCliente = clienteId || 'all'

  const { data: metricas, isLoading, error } = useSWR(
    `metricas-${selectedMonth}-${selectedYear}`,
    () => fetchMetricas(selectedMonth, selectedYear)
  )

  // Get unique colaboradores and clientes for filters
  const colaboradores = useMemo(() => {
    if (!metricas) return []
    const unique = new Map<string, { id: string; nombre: string; apellido: string | null }>()
    metricas.forEach(m => {
      if (m.colaborador) {
        unique.set(m.colaborador.id, m.colaborador)
      }
    })
    return Array.from(unique.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [metricas])

  const clientes = useMemo(() => {
    if (!metricas) return []
    const unique = new Map<string, { id: string; nombre_del_negocio: string }>()
    metricas.forEach(m => {
      if (m.cliente) {
        unique.set(m.cliente.id, m.cliente)
      }
    })
    return Array.from(unique.values()).sort((a, b) => a.nombre_del_negocio.localeCompare(b.nombre_del_negocio))
  }, [metricas])

  // Aggregate by colaborador
  const byColaborador = useMemo(() => {
    if (!metricas) return []
    
    const grouped = new Map<string, {
      colaborador: { id: string; nombre: string; apellido: string | null }
      totalMinimo: number
      totalMaximo: number
      totalAsignado: number
      clientes: Array<{
        cliente: { id: string; nombre_del_negocio: string }
        minimo: number
        maximo: number
        asignado: number
      }>
    }>()

    metricas.forEach(m => {
      if (!m.colaborador) return
      
      const existing = grouped.get(m.colaborador.id)
      const clienteData = {
        cliente: m.cliente || { id: m.cliente_id, nombre_del_negocio: 'Sin nombre' },
        minimo: m.minimo_no_negociable_horas || 0,
        maximo: m.horas_objetivo || 0,
        asignado: m.acumulado_mes_asignado || 0,
      }

      if (existing) {
        existing.totalMinimo += clienteData.minimo
        existing.totalMaximo += clienteData.maximo
        existing.totalAsignado += clienteData.asignado
        existing.clientes.push(clienteData)
      } else {
        grouped.set(m.colaborador.id, {
          colaborador: m.colaborador,
          totalMinimo: clienteData.minimo,
          totalMaximo: clienteData.maximo,
          totalAsignado: clienteData.asignado,
          clientes: [clienteData],
        })
      }
    })

    return Array.from(grouped.values())
      .filter(item => filterColaborador === 'all' || item.colaborador.id === filterColaborador)
      .sort((a, b) => a.colaborador.nombre.localeCompare(b.colaborador.nombre))
  }, [metricas, filterColaborador])

  // Aggregate by cliente
  const byCliente = useMemo(() => {
    if (!metricas) return []
    
    const grouped = new Map<string, {
      cliente: { id: string; nombre_del_negocio: string }
      totalMinimo: number
      totalMaximo: number
      totalAsignado: number
      colaboradores: Array<{
        colaborador: { id: string; nombre: string; apellido: string | null }
        minimo: number
        maximo: number
        asignado: number
      }>
    }>()

    metricas.forEach(m => {
      if (!m.cliente) return
      
      const existing = grouped.get(m.cliente.id)
      const colaboradorData = {
        colaborador: m.colaborador || { id: m.colaborador_id, nombre: 'Sin nombre', apellido: null },
        minimo: m.minimo_no_negociable_horas || 0,
        maximo: m.horas_objetivo || 0,
        asignado: m.acumulado_mes_asignado || 0,
      }

      if (existing) {
        existing.totalMinimo += colaboradorData.minimo
        existing.totalMaximo += colaboradorData.maximo
        existing.totalAsignado += colaboradorData.asignado
        existing.colaboradores.push(colaboradorData)
      } else {
        grouped.set(m.cliente.id, {
          cliente: m.cliente,
          totalMinimo: colaboradorData.minimo,
          totalMaximo: colaboradorData.maximo,
          totalAsignado: colaboradorData.asignado,
          colaboradores: [colaboradorData],
        })
      }
    })

    return Array.from(grouped.values())
      .filter(item => filterCliente === 'all' || item.cliente.id === filterCliente)
      .sort((a, b) => a.cliente.nombre_del_negocio.localeCompare(b.cliente.nombre_del_negocio))
  }, [metricas, filterCliente])

  // Summary stats
  const summary = useMemo(() => {
    const totalOk = byColaborador.filter(c => {
      const status = getHoursStatus(c.totalAsignado, c.totalMinimo, c.totalMaximo)
      return status.status === 'ok'
    }).length

    const totalWarning = byColaborador.filter(c => {
      const status = getHoursStatus(c.totalAsignado, c.totalMinimo, c.totalMaximo)
      return status.status === 'warning'
    }).length

    const totalDanger = byColaborador.filter(c => {
      const status = getHoursStatus(c.totalAsignado, c.totalMinimo, c.totalMaximo)
      return status.status === 'danger'
    }).length

    return { totalOk, totalWarning, totalDanger, total: byColaborador.length }
  }, [byColaborador])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-destructive">
            Error al cargar las métricas. Por favor, intenta de nuevo.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Quick summary */}
      <div className="flex items-center gap-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="font-medium text-emerald-600">{summary.totalOk}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Colaboradores dentro del rango</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="font-medium text-amber-600">{summary.totalWarning}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Colaboradores cerca del límite</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/30">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="font-medium text-red-600">{summary.totalDanger}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Colaboradores fuera de rango</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="by-colaborador" className="space-y-4">
        <TabsList>
          <TabsTrigger value="by-colaborador" className="gap-2">
            <Users className="w-4 h-4" />
            Por Colaborador
          </TabsTrigger>
          <TabsTrigger value="by-cliente" className="gap-2">
            <Building2 className="w-4 h-4" />
            Por Cliente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-colaborador" className="space-y-4">
          {/* Cards for each colaborador */}
          {byColaborador.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  No hay datos de métricas para el período seleccionado.
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {byColaborador.map((item) => {
                const status = getHoursStatus(item.totalAsignado, item.totalMinimo, item.totalMaximo)
                const progressPercent = item.totalMaximo > 0 
                  ? Math.min((item.totalAsignado / item.totalMaximo) * 100, 100) 
                  : 0
                const minPercent = item.totalMaximo > 0 
                  ? (item.totalMinimo / item.totalMaximo) * 100 
                  : 0

                return (
                  <Card key={item.colaborador.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <StatusIcon status={status.status} />
                          <div>
                            <CardTitle className="text-base">
                              {item.colaborador.nombre}{item.colaborador.apellido ? ` ${item.colaborador.apellido}` : ''}
                            </CardTitle>
                            <CardDescription>
                              {item.clientes.length} cliente{item.clientes.length !== 1 ? 's' : ''} asignado{item.clientes.length !== 1 ? 's' : ''}
                            </CardDescription>
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Progress bar general del colaborador */}
                      <HoursProgressBar 
                        asignado={item.totalAsignado}
                        minimo={item.totalMinimo}
                        maximo={item.totalMaximo}
                      />

                      {/* Breakdown by client with progress bars */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Desglose por Cliente</h4>
                        <div className="space-y-2">
                          {item.clientes.map((c) => {
                            const pace = calculatePaceStatus(c.asignado, c.minimo, selectedMonth, selectedYear)
                            return (
                              <div key={c.cliente.id} className="flex items-center gap-4 py-2 px-3 bg-muted/30 rounded-lg">
                                <div className="min-w-[180px]">
                                  <span className="text-sm font-medium">{c.cliente.nombre_del_negocio}</span>
                                  <div className="text-xs text-muted-foreground font-mono">
                                    {formatHoursToTime(c.minimo)} - {formatHoursToTime(c.maximo)}
                                  </div>
                                  {c.minimo > 0 && (
                                    <div className="mt-1 flex items-center gap-2">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                              <Clock className="w-3 h-3" />
                                              <span>Esperado: <span className="font-mono">{formatHoursToTime(pace.expectedHours)}</span></span>
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Horas que deberian estar marcadas al dia {new Date().getDate()} para cumplir el minimo de {formatHoursToTime(c.minimo)} al fin de mes</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      <PaceIndicator 
                                        asignado={c.asignado}
                                        minimo={c.minimo}
                                        selectedMonth={selectedMonth}
                                        selectedYear={selectedYear}
                                      />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <CompactProgressBar 
                                    asignado={c.asignado}
                                    minimo={c.minimo}
                                    maximo={c.maximo}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="by-cliente" className="space-y-4">
          {/* Cards for each cliente */}
          {byCliente.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  No hay datos de métricas para el período seleccionado.
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {byCliente.map((item) => {
                const status = getHoursStatus(item.totalAsignado, item.totalMinimo, item.totalMaximo)

                return (
                  <Card key={item.cliente.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <StatusIcon status={status.status} />
                          <div>
                            <CardTitle className="text-base">
                              {item.cliente.nombre_del_negocio}
                            </CardTitle>
                            <CardDescription>
                              {item.colaboradores.length} colaborador{item.colaboradores.length !== 1 ? 'es' : ''} asignado{item.colaboradores.length !== 1 ? 's' : ''}
                            </CardDescription>
                          </div>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Progress bar general del cliente */}
                      <HoursProgressBar 
                        asignado={item.totalAsignado}
                        minimo={item.totalMinimo}
                        maximo={item.totalMaximo}
                      />

                      {/* Breakdown by colaborador with progress bars */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Desglose por Colaborador</h4>
                        <div className="space-y-2">
                          {item.colaboradores.map((c) => {
                            const pace = calculatePaceStatus(c.asignado, c.minimo, selectedMonth, selectedYear)
                            return (
                              <div key={c.colaborador.id} className="flex items-center gap-4 py-2 px-3 bg-muted/30 rounded-lg">
                                <div className="min-w-[180px]">
                                  <span className="text-sm font-medium">
                                    {c.colaborador.nombre}{c.colaborador.apellido ? ` ${c.colaborador.apellido}` : ''}
                                  </span>
                                  <div className="text-xs text-muted-foreground font-mono">
                                    {formatHoursToTime(c.minimo)} - {formatHoursToTime(c.maximo)}
                                  </div>
                                  {c.minimo > 0 && (
                                    <div className="mt-1 flex items-center gap-2">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                              <Clock className="w-3 h-3" />
                                              <span>Esperado: <span className="font-mono">{formatHoursToTime(pace.expectedHours)}</span></span>
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Horas que deberian estar marcadas al dia {new Date().getDate()} para cumplir el minimo de {formatHoursToTime(c.minimo)} al fin de mes</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      <PaceIndicator 
                                        asignado={c.asignado}
                                        minimo={c.minimo}
                                        selectedMonth={selectedMonth}
                                        selectedYear={selectedYear}
                                      />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <CompactProgressBar 
                                    asignado={c.asignado}
                                    minimo={c.minimo}
                                    maximo={c.maximo}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
