'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Users, Building2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
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
  status: 'ok' | 'warning' | 'danger'
  message: string
}

function getHoursStatus(
  asignadas: number,
  minimo: number,
  maximo: number
): HoursStatus {
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
        Atención
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

function StatusIcon({ status }: { status: 'ok' | 'warning' | 'danger' }) {
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

// Custom progress bar with min/max markers and color logic
// - Gray: 0 to min (below minimum)
// - Green: min to max (within range)
// - Red: exceeds max (over limit)
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
  
  // Fetch metricas_colaboradores
  const { data: metricas, error: metricasError } = await supabase
    .from('metricas_colaboradores')
    .select(`
      *,
      colaborador:colaborador_id(id, nombre, apellido),
      cliente:cliente_id(id, nombre_del_negocio)
    `)
    .eq('mes', mes)
    .eq('anio', anio)
  
  if (metricasError) throw metricasError
  
  // Calculate the date range for the selected month
  const startDate = new Date(anio, mes - 1, 1)
  const endDate = new Date(anio, mes, 0) // Last day of the month
  const startDateStr = startDate.toISOString().split('T')[0]
  const endDateStr = endDate.toISOString().split('T')[0]
  
  // Fetch actual hours from entradas_de_tiempo for the selected month
  const { data: entries, error: entriesError } = await supabase
    .from('entradas_de_tiempo')
    .select('colaborador_id, cliente_id, duracion_seg')
    .gte('iniciado_en', `${startDateStr}T00:00:00`)
    .lte('iniciado_en', `${endDateStr}T23:59:59`)
  
  if (entriesError) throw entriesError
  
  // Calculate hours per colaborador-cliente pair
  const hoursMap = new Map<string, number>()
  entries?.forEach(entry => {
    if (entry.colaborador_id && entry.cliente_id && entry.duracion_seg) {
      const key = `${entry.colaborador_id}-${entry.cliente_id}`
      hoursMap.set(key, (hoursMap.get(key) || 0) + (entry.duracion_seg / 3600))
    }
  })
  
  // Merge hours into metricas
  const metricasWithHours = (metricas || []).map(m => ({
    ...m,
    acumulado_mes_asignado: hoursMap.get(`${m.colaborador_id}-${m.cliente_id}`) || 0
  }))
  
  return metricasWithHours as MetricaColaborador[]
}

export function HoursControlPanel() {
  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [filterColaborador, setFilterColaborador] = useState<string>('all')
  const [filterCliente, setFilterCliente] = useState<string>('all')

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

  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ]

  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i)

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
      {/* Period selector and summary */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Mes</Label>
            <Select 
              value={selectedMonth.toString()} 
              onValueChange={(v) => setSelectedMonth(parseInt(v))}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map(m => (
                  <SelectItem key={m.value} value={m.value.toString()}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-medium">Año</Label>
            <Select 
              value={selectedYear.toString()} 
              onValueChange={(v) => setSelectedYear(parseInt(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

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
          {/* Filter */}
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Filtrar:</Label>
            <Select value={filterColaborador} onValueChange={setFilterColaborador}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Seleccionar colaborador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los colaboradores</SelectItem>
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}{c.apellido ? ` ${c.apellido}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                          {item.clientes.map((c) => (
                            <div key={c.cliente.id} className="flex items-center gap-4 py-2 px-3 bg-muted/30 rounded-lg">
                              <div className="min-w-[160px]">
                                <span className="text-sm font-medium">{c.cliente.nombre_del_negocio}</span>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {formatHoursToTime(c.minimo)} - {formatHoursToTime(c.maximo)}
                                </div>
                              </div>
                              <div className="flex-1">
                                <CompactProgressBar 
                                  asignado={c.asignado}
                                  minimo={c.minimo}
                                  maximo={c.maximo}
                                />
                              </div>
                            </div>
                          ))}
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
          {/* Filter */}
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Filtrar:</Label>
            <Select value={filterCliente} onValueChange={setFilterCliente}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los clientes</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre_del_negocio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                          {item.colaboradores.map((c) => (
                            <div key={c.colaborador.id} className="flex items-center gap-4 py-2 px-3 bg-muted/30 rounded-lg">
                              <div className="min-w-[160px]">
                                <span className="text-sm font-medium">
                                  {c.colaborador.nombre}{c.colaborador.apellido ? ` ${c.colaborador.apellido}` : ''}
                                </span>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {formatHoursToTime(c.minimo)} - {formatHoursToTime(c.maximo)}
                                </div>
                              </div>
                              <div className="flex-1">
                                <CompactProgressBar 
                                  asignado={c.asignado}
                                  minimo={c.minimo}
                                  maximo={c.maximo}
                                />
                              </div>
                            </div>
                          ))}
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
