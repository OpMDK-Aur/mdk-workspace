'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, format } from 'date-fns'
import { HoursChart } from '@/components/reports/hours-chart'
import { ClientDonutChart } from '@/components/reports/client-donut-chart'
import { ClientSummaryTable } from '@/components/reports/client-summary-table'
import { HoursControlPanel } from '@/components/reports/hours-control-panel'
import { ServiceMapReport } from '@/components/reports/service-map-report'
import { NPSReport } from '@/components/reports/nps-report'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Download, Users, Loader2, ClipboardCheck, Map, Star, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/lib/types'
import type { ClientPlan, UnidadNegocio } from '@/lib/types'
import type { ClientSummary } from '@/lib/time-tracking/types'
import { toast } from 'sonner'

const MONTHS = [
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

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

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
  
  const [clientsRes, entriesRes, profilesRes] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre_del_negocio'),
    supabase.from('entradas_de_tiempo').select('*').order('iniciado_en', { ascending: false }),
    supabase.from('colaboradores').select('id, nombre, apellido').order('nombre'),
  ])

  return {
    clients: (clientsRes.data || []) as Client[],
    entries: (entriesRes.data || []) as TimeEntry[],
    users: (profilesRes.data || []) as User[],
  }
}

export default function ReportsPage() {
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  
  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedColaborador, setSelectedColaborador] = useState<string>('all')
  const [selectedCliente, setSelectedCliente] = useState<string>('all')
  const [selectedMatrixColab, setSelectedMatrixColab] = useState<string>('all')
  const [selectedDayColab, setSelectedDayColab] = useState<string>('all')
  const [planFilter, setPlanFilter] = useState<ClientPlan | 'all'>('all')
  const [unidadFilter, setUnidadFilter] = useState<UnidadNegocio | 'all'>('all')
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'by-client')
  
  // Update active tab when URL changes
  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  // Fetch data with SWR
  const { data, isLoading } = useSWR('reports-data', fetchReportsData)

  const clients = data?.clients || []
  const allEntries = data?.entries || []
  const users = data?.users || []

  // Filter entries by month/year and selected collaborador/cliente
  const filteredEntries = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1))
    const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1))
    
    return allEntries.filter((entry) => {
      const entryDate = new Date(entry.iniciado_en)
      
      // Filter by month/year
      const isInRange = isWithinInterval(entryDate, {
        start: monthStart,
        end: monthEnd,
      })
      if (!isInRange) return false
      
      // Filter by selected colaborador (global filter)
      if (selectedColaborador !== 'all' && entry.colaborador_id !== selectedColaborador) {
        return false
      }
      
      // Filter by selected cliente (global filter)
      if (selectedCliente !== 'all' && entry.cliente_id !== selectedCliente) {
        return false
      }
      
      return true
    })
  }, [allEntries, selectedMonth, selectedYear, selectedColaborador, selectedCliente])

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

  // Calculate daily hours for the chart (with optional collaborator filter)
  const dailyHours = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1))
    const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1))
    
    // Filter entries by selected collaborator for the day chart
    const entriesForDayChart = selectedDayColab === 'all' 
      ? filteredEntries 
      : filteredEntries.filter(e => e.colaborador_id === selectedDayColab)
    
    const days: { date: string, hours: number, billableHours: number }[] = []
    const currentDate = new Date(monthStart)
    
    while (currentDate <= monthEnd) {
      const dayStart = startOfDay(currentDate)
      const dayEnd = endOfDay(currentDate)
      
      const dayEntries = entriesForDayChart.filter((entry) => {
        const entryDate = new Date(entry.iniciado_en)
        return isWithinInterval(entryDate, { start: dayStart, end: dayEnd })
      })
      
      const hours = dayEntries.reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      const billable = dayEntries.filter((e) => e.facturable).reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      
      days.push({
        date: format(currentDate, 'd'),
        hours: Math.round(hours * 10) / 10,
        billableHours: Math.round(billable * 10) / 10,
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return days
  }, [selectedMonth, selectedYear, filteredEntries, selectedDayColab])

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
        {/* Month Selector */}
        <Select
          value={selectedMonth.toString()}
          onValueChange={(val) => setSelectedMonth(parseInt(val))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((month) => (
              <SelectItem key={month.value} value={month.value.toString()}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Year Selector */}
        <Select
          value={selectedYear.toString()}
          onValueChange={(val) => setSelectedYear(parseInt(val))}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Colaborador Filter */}
        <Select
          value={selectedColaborador}
          onValueChange={setSelectedColaborador}
        >
          <SelectTrigger className="w-[200px]">
            <Users className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Colaborador" />
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

        {/* Cliente Filter */}
        <Select
          value={selectedCliente}
          onValueChange={setSelectedCliente}
        >
          <SelectTrigger className="w-[200px]">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los clientes</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.nombre_del_negocio || client.business_name || 'Sin nombre'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Plan Filter */}
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as ClientPlan | 'all')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
            <SelectItem value="Esencial">Esencial</SelectItem>
            <SelectItem value="Estrategico">Estrategico</SelectItem>
          </SelectContent>
        </Select>

        {/* Unidad Filter */}
        <Select value={unidadFilter} onValueChange={(v) => setUnidadFilter(v as UnidadNegocio | 'all')}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las unidades</SelectItem>
            <SelectItem value="MDK">MDK</SelectItem>
            <SelectItem value="Aurelia">Aurelia</SelectItem>
            <SelectItem value="Consultoría">Consultoría</SelectItem>
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="by-client">Por Cliente</TabsTrigger>
          <TabsTrigger value="by-collaborator">Por Colaborador</TabsTrigger>
          <TabsTrigger value="by-matrix">Colaborador x Cliente</TabsTrigger>
          <TabsTrigger value="by-day">Por Día</TabsTrigger>
            <TabsTrigger value="hours-control" className="gap-2">
              <ClipboardCheck className="w-4 h-4" />
              Control de Horas
            </TabsTrigger>
            <TabsTrigger value="service-map" className="gap-2">
              <Map className="w-4 h-4" />
              Mapa de Servicio
            </TabsTrigger>
            <TabsTrigger value="nps" className="gap-2">
              <Star className="w-4 h-4" />
              NPS
            </TabsTrigger>
          </TabsList>
        
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

          <TabsContent value="hours-control">
            <HoursControlPanel 
              month={selectedMonth}
              year={selectedYear}
              colaboradorId={selectedColaborador !== 'all' ? selectedColaborador : undefined}
              clienteId={selectedCliente !== 'all' ? selectedCliente : undefined}
            />
          </TabsContent>

          <TabsContent value="service-map">
            <ServiceMapReport 
              month={selectedMonth}
              year={selectedYear}
            />
          </TabsContent>

          <TabsContent value="nps">
            <NPSReport 
              month={selectedMonth}
              year={selectedYear}
              planFilter={planFilter}
              unidadFilter={unidadFilter}
            />
          </TabsContent>
        </Tabs>
    </div>
  )
}
