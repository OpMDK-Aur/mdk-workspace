'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { DateRange } from 'react-day-picker'
import { HoursChart } from '@/components/reports/hours-chart'
import { ClientDonutChart } from '@/components/reports/client-donut-chart'
import { ClientSummaryTable } from '@/components/reports/client-summary-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CalendarIcon, Download, Users, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
import type { ClientSummary } from '@/lib/time-tracking/types'
import { toast } from 'sonner'

interface TimeEntry {
  id: string
  cliente_id: string | null
  descripcion: string | null
  iniciado_en: string
  finalizado_en: string | null
  duracion_seg: number | null
  facturable: boolean
  colaborador_id: string | null
}

interface User {
  id: string
  nombre: string
  apellido?: string | null
}

interface MetricaColaborador {
  id: string
  colaborador_id: string
  cliente_id: string
  colaborador?: { id: string; nombre: string; apellido: string | null }
  cliente?: { id: string; nombre_del_negocio: string }
  horas_teoricas_cliente: number
  minimo_no_negociable_horas: number
  horas_objetivo: number
  mes: number
  anio: number
}

// Convert decimal hours to HH:MM:SS format
const formatHoursToTime = (hours: number): string => {
  if (!hours || isNaN(hours) || hours === 0) return '00:00:00'
  const totalSeconds = Math.round(hours * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Generate consistent color from string
function stringToColor(str: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// Fetcher for SWR
async function fetchReportsData() {
  const supabase = createClient()
  
  // Get current month and year for metricas
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  
  const [clientsRes, entriesRes, profilesRes, metricasRes] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre_del_negocio'),
    supabase.from('entradas_de_tiempo').select('*').order('iniciado_en', { ascending: false }),
    supabase.from('colaboradores').select('id, nombre, apellido').order('nombre'),
    supabase.from('metricas_colaboradores').select(`
      *,
      colaborador:colaborador_id(id, nombre, apellido),
      cliente:cliente_id(id, nombre_del_negocio)
    `).eq('mes', currentMonth).eq('anio', currentYear),
  ])

  return {
    clients: (clientsRes.data || []) as Client[],
    entries: (entriesRes.data || []) as TimeEntry[],
    users: (profilesRes.data || []) as User[],
    metricas: (metricasRes.data || []) as MetricaColaborador[],
    currentMonth,
    currentYear,
  }
}

export default function ReportsPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  })
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [selectedMatrixColab, setSelectedMatrixColab] = useState<string>('all')
  const [selectedDayColab, setSelectedDayColab] = useState<string>('all')
  const [expandedColaboradores, setExpandedColaboradores] = useState<Set<string>>(new Set())

  // Fetch data with SWR
  const { data, isLoading } = useSWR('reports-data', fetchReportsData)

  const clients = data?.clients || []
  const allEntries = data?.entries || []
  const users = data?.users || []
  const metricas = data?.metricas || []
  const reportMonth = data?.currentMonth || new Date().getMonth() + 1
  const reportYear = data?.currentYear || new Date().getFullYear()

  // Toggle expanded colaborador
  const toggleColaborador = (colabId: string) => {
    setExpandedColaboradores(prev => {
      const next = new Set(prev)
      if (next.has(colabId)) {
        next.delete(colabId)
      } else {
        next.add(colabId)
      }
      return next
    })
  }

  // Filter entries by date range and selected members
  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      const entryDate = new Date(entry.iniciado_en)
      
      // Filter by date range
      if (date?.from && date?.to) {
        const isInRange = isWithinInterval(entryDate, {
          start: startOfDay(date.from),
          end: endOfDay(date.to),
        })
        if (!isInRange) return false
      }
      
      // Filter by selected members
      if (selectedMembers.length > 0 && entry.colaborador_id) {
        if (!selectedMembers.includes(entry.colaborador_id)) return false
      }
      
      return true
    })
  }, [allEntries, date, selectedMembers])

  // Calculate client summaries from filtered entries
  const clientSummaries: ClientSummary[] = useMemo(() => {
    // Group entries by client
    const clientHoursMap: Record<string, { hours: number, billableHours: number }> = {}
    
    filteredEntries.forEach((entry) => {
      if (entry.cliente_id) {
        if (!clientHoursMap[entry.cliente_id]) {
          clientHoursMap[entry.cliente_id] = { hours: 0, billableHours: 0 }
        }
        const hours = (entry.duracion_seg || 0) / 3600
        clientHoursMap[entry.cliente_id].hours += hours
        if (entry.facturable) {
          clientHoursMap[entry.cliente_id].billableHours += hours
        }
      }
    })

    const totalHours = Object.values(clientHoursMap).reduce((acc, c) => acc + c.hours, 0)
    
    return clients
      .filter((client) => clientHoursMap[client.id])
      .map((client) => {
        const data = clientHoursMap[client.id] || { hours: 0, billableHours: 0 }
        const clientName = client.nombre_del_negocio || client.business_name || 'Sin nombre'
        return {
          client_id: client.id,
          client_name: clientName,
          client_color: stringToColor(clientName),
          projects_count: 0,
          hours: data.hours,
          percentage: totalHours > 0 ? (data.hours / totalHours) * 100 : 0,
          billable_hours: data.billableHours,
        }
      })
      .sort((a, b) => b.hours - a.hours)
  }, [clients, filteredEntries])

  // Calculate collaborator summaries from filtered entries
  const collaboratorSummaries = useMemo(() => {
    const colabHoursMap: Record<string, { hours: number, billableHours: number }> = {}
    
    filteredEntries.forEach((entry) => {
      if (entry.colaborador_id) {
        if (!colabHoursMap[entry.colaborador_id]) {
          colabHoursMap[entry.colaborador_id] = { hours: 0, billableHours: 0 }
        }
        const hours = (entry.duracion_seg || 0) / 3600
        colabHoursMap[entry.colaborador_id].hours += hours
        if (entry.facturable) {
          colabHoursMap[entry.colaborador_id].billableHours += hours
        }
      }
    })

    const totalHoursColab = Object.values(colabHoursMap).reduce((acc, c) => acc + c.hours, 0)
    
    return users
      .filter((user) => colabHoursMap[user.id])
      .map((user) => {
        const data = colabHoursMap[user.id] || { hours: 0, billableHours: 0 }
        const userName = `${user.nombre}${user.apellido ? ` ${user.apellido}` : ''}`
        return {
          colaborador_id: user.id,
          colaborador_name: userName,
          colaborador_color: stringToColor(userName),
          hours: data.hours,
          percentage: totalHoursColab > 0 ? (data.hours / totalHoursColab) * 100 : 0,
          billable_hours: data.billableHours,
        }
      })
      .sort((a, b) => b.hours - a.hours)
  }, [users, filteredEntries])

  // Calculate collaborator-client matrix
  const collaboratorClientMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {}
    
    filteredEntries.forEach((entry) => {
      if (entry.colaborador_id && entry.cliente_id) {
        if (!matrix[entry.colaborador_id]) {
          matrix[entry.colaborador_id] = {}
        }
        const hours = (entry.duracion_seg || 0) / 3600
        matrix[entry.colaborador_id][entry.cliente_id] = 
          (matrix[entry.colaborador_id][entry.cliente_id] || 0) + hours
      }
    })
    
    // Get unique client IDs from entries
    const clientIds = [...new Set(filteredEntries.filter(e => e.cliente_id).map(e => e.cliente_id!))]
    
    return {
      matrix,
      clientIds,
      collaboratorIds: Object.keys(matrix)
    }
  }, [filteredEntries])

  // Calculate totals
  const totalHours = filteredEntries.reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
  const billableHours = filteredEntries.filter((e) => e.facturable).reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
  const billablePercentage = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

  // Calculate hours marked per colaborador and client for current month
  const horasMaracadasPorColabCliente = useMemo(() => {
    const currentMonthEntries = allEntries.filter(entry => {
      const entryDate = new Date(entry.iniciado_en)
      return entryDate.getMonth() + 1 === reportMonth && entryDate.getFullYear() === reportYear
    })
    
    const map: Record<string, Record<string, number>> = {}
    currentMonthEntries.forEach(entry => {
      if (entry.colaborador_id && entry.cliente_id) {
        if (!map[entry.colaborador_id]) map[entry.colaborador_id] = {}
        const hours = (entry.duracion_seg || 0) / 3600
        map[entry.colaborador_id][entry.cliente_id] = (map[entry.colaborador_id][entry.cliente_id] || 0) + hours
      }
    })
    return map
  }, [allEntries, reportMonth, reportYear])

  // Team hours summary by colaborador
  const teamHoursByColaborador = useMemo(() => {
    // Group metricas by colaborador
    const byColab: Record<string, {
      colaborador: { id: string; nombre: string; apellido: string | null }
      totalObjetivo: number
      totalMinimo: number
      totalMarcadas: number
      clientes: Array<{
        cliente: { id: string; nombre_del_negocio: string }
        objetivo: number
        minimo: number
        marcadas: number
      }>
    }> = {}

    metricas.forEach(m => {
      if (!m.colaborador) return
      const colabId = m.colaborador_id
      
      // Use values from database columns (horas_objetivo and minimo_no_negociable_horas)
      const objetivo = Number(m.horas_objetivo) || 0
      const minimo = Number(m.minimo_no_negociable_horas) || 0
      
      if (!byColab[colabId]) {
        byColab[colabId] = {
          colaborador: m.colaborador,
          totalObjetivo: 0,
          totalMinimo: 0,
          totalMarcadas: 0,
          clientes: []
        }
      }
      
      const marcadas = horasMaracadasPorColabCliente[colabId]?.[m.cliente_id] || 0
      
      byColab[colabId].totalObjetivo += objetivo
      byColab[colabId].totalMinimo += minimo
      byColab[colabId].totalMarcadas += marcadas
      
      if (m.cliente) {
        byColab[colabId].clientes.push({
          cliente: m.cliente,
          objetivo,
          minimo,
          marcadas
        })
      }
    })

    return Object.values(byColab).sort((a, b) => 
      a.colaborador.nombre.localeCompare(b.colaborador.nombre)
    )
  }, [metricas, horasMaracadasPorColabCliente])

  // Team hours summary by client
  const teamHoursByCliente = useMemo(() => {
    // Group metricas by cliente
    const byCliente: Record<string, {
      cliente: { id: string; nombre_del_negocio: string }
      totalObjetivo: number
      totalMinimo: number
      totalMarcadas: number
    }> = {}

    metricas.forEach(m => {
      if (!m.cliente) return
      const clienteId = m.cliente_id
      
      // Use values from database columns (horas_objetivo and minimo_no_negociable_horas)
      const objetivo = Number(m.horas_objetivo) || 0
      const minimo = Number(m.minimo_no_negociable_horas) || 0
      
      if (!byCliente[clienteId]) {
        byCliente[clienteId] = {
          cliente: m.cliente,
          totalObjetivo: 0,
          totalMinimo: 0,
          totalMarcadas: 0
        }
      }
      
      const marcadas = horasMaracadasPorColabCliente[m.colaborador_id]?.[clienteId] || 0
      
      byCliente[clienteId].totalObjetivo += objetivo
      byCliente[clienteId].totalMinimo += minimo
      byCliente[clienteId].totalMarcadas += marcadas
    })

    return Object.values(byCliente).sort((a, b) => 
      a.cliente.nombre_del_negocio.localeCompare(b.cliente.nombre_del_negocio)
    )
  }, [metricas, horasMaracadasPorColabCliente])

  // Calculate daily hours for the chart (with optional collaborator filter)
  const dailyHours = useMemo(() => {
    if (!date?.from || !date?.to) return []
    
    // Filter entries by selected collaborator for the day chart
    const entriesForDayChart = selectedDayColab === 'all' 
      ? filteredEntries 
      : filteredEntries.filter(e => e.colaborador_id === selectedDayColab)
    
    const days: { date: string, hours: number, billableHours: number }[] = []
    const currentDate = new Date(date.from)
    const endDate = new Date(date.to)
    
    while (currentDate <= endDate) {
      const dayStart = startOfDay(currentDate)
      const dayEnd = endOfDay(currentDate)
      
      const dayEntries = entriesForDayChart.filter((entry) => {
        const entryDate = new Date(entry.iniciado_en)
        return isWithinInterval(entryDate, { start: dayStart, end: dayEnd })
      })
      
      const hours = dayEntries.reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      const billable = dayEntries.filter((e) => e.facturable).reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      
      days.push({
        date: format(currentDate, 'EEE'),
        hours: Math.round(hours * 10) / 10,
        billableHours: Math.round(billable * 10) / 10,
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return days
  }, [date, filteredEntries, selectedDayColab])

  const handleExport = () => {
    toast.success('Export started', {
      description: 'Your report will be downloaded shortly.',
    })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Analyze your time tracking data
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'justify-start text-left font-normal w-[280px]',
                !date && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, 'LLL dd, y')} - {format(date.to, 'LLL dd, y')}
                  </>
                ) : (
                  format(date.from, 'LLL dd, y')
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {/* Team Member Filter */}
        <Select
          value={selectedMembers.length > 0 ? selectedMembers[0] : 'all'}
          onValueChange={(val) => setSelectedMembers(val === 'all' ? [] : [val])}
        >
          <SelectTrigger className="w-[200px]">
            <Users className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All team members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los colaboradores</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.nombre}{user.apellido ? ` ${user.apellido}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Hours</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {totalHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Billable Hours</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billableHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Billable %</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billablePercentage.toFixed(0)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Tables with Tabs */}
      <Tabs defaultValue="team-hours" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="team-hours">Horas del Equipo</TabsTrigger>
          <TabsTrigger value="by-client">Por Cliente</TabsTrigger>
          <TabsTrigger value="by-collaborator">Por Colaborador</TabsTrigger>
          <TabsTrigger value="by-matrix">Colaborador x Cliente</TabsTrigger>
          <TabsTrigger value="by-day">Por Día</TabsTrigger>
        </TabsList>
        
        {/* Team Hours Tab */}
        <TabsContent value="team-hours">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Por Colaborador */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Horas por Colaborador</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {new Date(reportYear, reportMonth - 1).toLocaleString('es', { month: 'long', year: 'numeric' })}
                  </p>
                </CardHeader>
                <CardContent>
                  {teamHoursByColaborador.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                      No hay métricas configuradas para este mes
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {teamHoursByColaborador.map((item) => {
                        const colabName = `${item.colaborador.nombre}${item.colaborador.apellido ? ` ${item.colaborador.apellido}` : ''}`
                        const isExpanded = expandedColaboradores.has(item.colaborador.id)
                        const porcentaje = item.totalObjetivo > 0 ? (item.totalMarcadas / item.totalObjetivo) * 100 : 0
                        
                        return (
                          <Collapsible 
                            key={item.colaborador.id} 
                            open={isExpanded}
                            onOpenChange={() => toggleColaborador(item.colaborador.id)}
                          >
                            <div className="border rounded-lg">
                              <CollapsibleTrigger className="w-full">
                                <div className="p-3 hover:bg-muted/50 transition-colors">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      <span className="font-medium text-sm">{colabName}</span>
                                    </div>
                                    <span className={cn(
                                      "text-xs px-2 py-0.5 rounded-full",
                                      porcentaje >= 100 ? "bg-green-500/20 text-green-400" :
                                      porcentaje >= 70 ? "bg-yellow-500/20 text-yellow-400" :
                                      "bg-red-500/20 text-red-400"
                                    )}>
                                      {porcentaje.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1 text-xs mt-1">
                                    <div className="flex flex-col items-start">
                                      <span className="text-muted-foreground text-[10px]">Objetivo</span>
                                      <span className="font-mono text-sm">{formatHoursToTime(item.totalObjetivo)}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                      <span className="text-muted-foreground text-[10px]">Mínimo</span>
                                      <span className="font-mono text-sm">{formatHoursToTime(item.totalMinimo)}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="text-muted-foreground text-[10px]">Marcadas</span>
                                      <span className={cn(
                                        "font-mono text-sm",
                                        item.totalMarcadas >= item.totalObjetivo ? "text-green-400" :
                                        item.totalMarcadas >= item.totalMinimo ? "text-yellow-400" :
                                        "text-red-400"
                                      )}>{formatHoursToTime(item.totalMarcadas)}</span>
                                    </div>
                                  </div>
                                  <Progress 
                                    value={Math.min(porcentaje, 100)} 
                                    className="h-1.5 mt-2"
                                  />
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="border-t bg-muted/30 p-2 space-y-1">
                                  {item.clientes.map((cliente) => {
                                    const clientePorcentaje = cliente.objetivo > 0 ? (cliente.marcadas / cliente.objetivo) * 100 : 0
                                    return (
                                      <div key={cliente.cliente.id} className="p-2 rounded bg-background/50 text-xs">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="truncate font-medium" title={cliente.cliente.nombre_del_negocio}>
                                            {cliente.cliente.nombre_del_negocio}
                                          </span>
                                          <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded",
                                            clientePorcentaje >= 100 ? "bg-green-500/20 text-green-400" :
                                            clientePorcentaje >= 70 ? "bg-yellow-500/20 text-yellow-400" :
                                            "bg-red-500/20 text-red-400"
                                          )}>
                                            {clientePorcentaje.toFixed(0)}%
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1">
                                          <div className="flex flex-col">
                                            <span className="text-muted-foreground text-[10px]">Obj</span>
                                            <span className="font-mono">{formatHoursToTime(cliente.objetivo)}</span>
                                          </div>
                                          <div className="flex flex-col items-center">
                                            <span className="text-muted-foreground text-[10px]">Mín</span>
                                            <span className="font-mono">{formatHoursToTime(cliente.minimo)}</span>
                                          </div>
                                          <div className="flex flex-col items-end">
                                            <span className="text-muted-foreground text-[10px]">Marcadas</span>
                                            <span className={cn(
                                              "font-mono",
                                              cliente.marcadas >= cliente.objetivo ? "text-green-400" :
                                              cliente.marcadas >= cliente.minimo ? "text-yellow-400" :
                                              "text-red-400"
                                            )}>
                                              {formatHoursToTime(cliente.marcadas)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Por Cliente */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Horas por Cliente</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {new Date(reportYear, reportMonth - 1).toLocaleString('es', { month: 'long', year: 'numeric' })} - Total de horas de todos los colaboradores
                  </p>
                </CardHeader>
                <CardContent>
                  {teamHoursByCliente.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                      No hay métricas configuradas para este mes
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {teamHoursByCliente.map((item) => {
                        const porcentaje = item.totalObjetivo > 0 ? (item.totalMarcadas / item.totalObjetivo) * 100 : 0
                        
                        return (
                          <div key={item.cliente.id} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm truncate max-w-[200px]" title={item.cliente.nombre_del_negocio}>
                                {item.cliente.nombre_del_negocio}
                              </span>
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full",
                                porcentaje >= 100 ? "bg-green-500/20 text-green-400" :
                                porcentaje >= 70 ? "bg-yellow-500/20 text-yellow-400" :
                                "bg-red-500/20 text-red-400"
                              )}>
                                {porcentaje.toFixed(0)}%
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-xs mt-1">
                              <div className="flex flex-col items-start">
                                <span className="text-muted-foreground text-[10px]">Objetivo</span>
                                <span className="font-mono text-sm">{formatHoursToTime(item.totalObjetivo)}</span>
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="text-muted-foreground text-[10px]">Mínimo</span>
                                <span className="font-mono text-sm">{formatHoursToTime(item.totalMinimo)}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-muted-foreground text-[10px]">Marcadas</span>
                                <span className={cn(
                                  "font-mono text-sm",
                                  item.totalMarcadas >= item.totalObjetivo ? "text-green-400" :
                                  item.totalMarcadas >= item.totalMinimo ? "text-yellow-400" :
                                  "text-red-400"
                                )}>{formatHoursToTime(item.totalMarcadas)}</span>
                              </div>
                            </div>
                            <Progress 
                              value={Math.min(porcentaje, 100)} 
                              className="h-1.5 mt-2"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="by-client">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ClientDonutChart clientSummaries={clientSummaries} />
              <ClientSummaryTable clientSummaries={clientSummaries} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="by-collaborator">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Donut Chart for Collaborators */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Horas por Colaborador</CardTitle>
                </CardHeader>
                <CardContent>
                  {collaboratorSummaries.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      Sin datos para el período seleccionado
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {collaboratorSummaries.map((colab) => (
                        <div key={colab.colaborador_id} className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full shrink-0" 
                            style={{ backgroundColor: colab.colaborador_color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium truncate">{colab.colaborador_name}</span>
                              <span className="text-sm text-muted-foreground ml-2">
                                {colab.hours.toFixed(1)}h ({colab.percentage.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${colab.percentage}%`,
                                  backgroundColor: colab.colaborador_color 
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              {/* Table for Collaborators */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detalle por Colaborador</CardTitle>
                </CardHeader>
                <CardContent>
                  {collaboratorSummaries.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      Sin datos para el período seleccionado
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 font-medium">Colaborador</th>
                            <th className="text-right py-2 font-medium">Horas</th>
                            <th className="text-right py-2 font-medium">Facturable</th>
                            <th className="text-right py-2 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {collaboratorSummaries.map((colab) => (
                            <tr key={colab.colaborador_id} className="border-b last:border-0">
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-2 h-2 rounded-full" 
                                    style={{ backgroundColor: colab.colaborador_color }}
                                  />
                                  <span className="truncate">{colab.colaborador_name}</span>
                                </div>
                              </td>
                              <td className="text-right py-2">{colab.hours.toFixed(1)}h</td>
                              <td className="text-right py-2">{colab.billable_hours.toFixed(1)}h</td>
                              <td className="text-right py-2">{colab.percentage.toFixed(0)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="by-matrix">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Filtro de colaborador */}
              <div className="flex items-center gap-4">
                <Label className="text-sm font-medium">Filtrar por colaborador:</Label>
                <Select value={selectedMatrixColab} onValueChange={setSelectedMatrixColab}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Seleccionar colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los colaboradores</SelectItem>
                    {users.filter(u => collaboratorClientMatrix.collaboratorIds.includes(u.id)).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.nombre}{user.apellido ? ` ${user.apellido}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Gráfico de barras cuando hay un colaborador seleccionado */}
              {selectedMatrixColab !== 'all' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Distribución de horas por cliente - {(() => {
                        const user = users.find(u => u.id === selectedMatrixColab)
                        return user ? `${user.nombre}${user.apellido ? ` ${user.apellido}` : ''}` : ''
                      })()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const colabData = collaboratorClientMatrix.matrix[selectedMatrixColab] || {}
                      const chartData = Object.entries(colabData)
                        .map(([clientId, hours]) => {
                          const client = clients.find(c => c.id === clientId)
                          return {
                            clientId,
                            clientName: client?.nombre_del_negocio || 'Sin asignar',
                            hours,
                            color: stringToColor(client?.nombre_del_negocio || clientId)
                          }
                        })
                        .sort((a, b) => b.hours - a.hours)
                      
                      const maxHours = Math.max(...chartData.map(d => d.hours), 1)
                      
                      if (chartData.length === 0) {
                        return (
                          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                            Sin horas registradas para este colaborador
                          </div>
                        )
                      }
                      
                      return (
                        <div className="space-y-3">
                          {chartData.map((item) => (
                            <div key={item.clientId} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="truncate max-w-[200px]">{item.clientName}</span>
                                <span className="font-medium">{item.hours.toFixed(1)}h</span>
                              </div>
                              <div className="h-6 bg-muted rounded overflow-hidden">
                                <div 
                                  className="h-full rounded transition-all duration-300"
                                  style={{ 
                                    width: `${(item.hours / maxHours) * 100}%`,
                                    backgroundColor: item.color 
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Tabla matriz */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {selectedMatrixColab === 'all' ? 'Horas por Colaborador y Cliente' : 'Detalle de horas'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {collaboratorClientMatrix.collaboratorIds.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      Sin datos para el período seleccionado
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2 font-medium sticky left-0 bg-background">Colaborador</th>
                            {collaboratorClientMatrix.clientIds.map((clientId) => {
                              const client = clients.find(c => c.id === clientId)
                              return (
                                <th key={clientId} className="text-right py-2 px-2 font-medium min-w-[100px]">
                                  <span className="truncate block max-w-[120px]" title={client?.nombre_del_negocio || clientId}>
                                    {client?.nombre_del_negocio || 'Sin asignar'}
                                  </span>
                                </th>
                              )
                            })}
                            <th className="text-right py-2 px-2 font-medium bg-muted/50">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {collaboratorClientMatrix.collaboratorIds
                            .filter(colabId => selectedMatrixColab === 'all' || colabId === selectedMatrixColab)
                            .map((colabId) => {
                              const user = users.find(u => u.id === colabId)
                              const userName = user ? `${user.nombre}${user.apellido ? ` ${user.apellido}` : ''}` : colabId
                              const rowTotal = Object.values(collaboratorClientMatrix.matrix[colabId] || {}).reduce((a, b) => a + b, 0)
                              
                              return (
                                <tr key={colabId} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="py-2 px-2 sticky left-0 bg-background">
                                    <div className="flex items-center gap-2">
                                      <div 
                                        className="w-2 h-2 rounded-full shrink-0" 
                                        style={{ backgroundColor: stringToColor(userName) }}
                                      />
                                      <span className="truncate">{userName}</span>
                                    </div>
                                  </td>
                                  {collaboratorClientMatrix.clientIds.map((clientId) => {
                                    const hours = collaboratorClientMatrix.matrix[colabId]?.[clientId] || 0
                                    return (
                                      <td key={clientId} className="text-right py-2 px-2">
                                        {hours > 0 ? `${hours.toFixed(1)}h` : '-'}
                                      </td>
                                    )
                                  })}
                                  <td className="text-right py-2 px-2 font-medium bg-muted/50">
                                    {rowTotal.toFixed(1)}h
                                  </td>
                                </tr>
                              )
                            })}
                          {/* Total row - only show when viewing all */}
                          {selectedMatrixColab === 'all' && (
                            <tr className="border-t-2 font-medium bg-muted/30">
                              <td className="py-2 px-2 sticky left-0 bg-muted/30">Total</td>
                              {collaboratorClientMatrix.clientIds.map((clientId) => {
                                const colTotal = collaboratorClientMatrix.collaboratorIds.reduce((acc, colabId) => {
                                  return acc + (collaboratorClientMatrix.matrix[colabId]?.[clientId] || 0)
                                }, 0)
                                return (
                                  <td key={clientId} className="text-right py-2 px-2">
                                    {colTotal > 0 ? `${colTotal.toFixed(1)}h` : '-'}
                                  </td>
                                )
                              })}
                              <td className="text-right py-2 px-2 bg-muted/50">
                                {totalHours.toFixed(1)}h
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="by-day">
          <div className="space-y-6">
            {/* Filtro de colaborador */}
            <div className="flex items-center gap-4">
              <Label className="text-sm font-medium">Filtrar por colaborador:</Label>
              <Select value={selectedDayColab} onValueChange={setSelectedDayColab}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Seleccionar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los colaboradores</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.nombre}{user.apellido ? ` ${user.apellido}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDayColab !== 'all' && (
                <span className="text-sm text-muted-foreground">
                  Mostrando horas de: {(() => {
                    const user = users.find(u => u.id === selectedDayColab)
                    return user ? `${user.nombre}${user.apellido ? ` ${user.apellido}` : ''}` : ''
                  })()}
                </span>
              )}
            </div>
            <HoursChart dailyHours={dailyHours} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
