'use client'

import { useState, useMemo, useEffect } from 'react'
import { redirect } from 'next/navigation'
import useSWR from 'swr'
import { startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, format } from 'date-fns'
import { HoursChart } from '@/components/reports/hours-chart'
import { ClientDonutChart } from '@/components/reports/client-donut-chart'
import { ClientSummaryTable } from '@/components/reports/client-summary-table'
import { HoursControlPanel } from '@/components/reports/hours-control-panel'
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
import { Download, Users, Loader2, Building2 } from 'lucide-react'
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
async function fetchControlHorasData() {
  const supabase = createClient()
  
  // Check if user is Master
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user found')
  
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, rol_id, roles(nombre)')
    .eq('email', user.email)
    .single()
  
  const roleName = (colaborador?.roles as { nombre: string } | null)?.nombre || ''
  if (roleName !== 'Master') {
    throw new Error('Unauthorized')
  }
  
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

export default function ControlHorasPage() {
  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedColaborador, setSelectedColaborador] = useState<string>('all')
  const [selectedCliente, setSelectedCliente] = useState<string>('all')
  const [selectedMatrixColab, setSelectedMatrixColab] = useState<string>('all')
  const [selectedDayColab, setSelectedDayColab] = useState<string>('all')
  const [planFilter, setPlanFilter] = useState<ClientPlan | 'all'>('all')
  const [unidadFilter, setUnidadFilter] = useState<UnidadNegocio | 'all'>('all')

  // Fetch data with SWR
  const { data, isLoading, error } = useSWR('control-horas-data', fetchControlHorasData)

  // Redirect if unauthorized
  useEffect(() => {
    if (error?.message === 'Unauthorized') {
      redirect('/dashboard')
    }
  }, [error])

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
    // Build CSV data
    const headers = ['Colaborador', 'Cliente', 'Horas', 'Horas Facturables']
    const rows: string[][] = []
    
    collaboratorSummaries.forEach(colab => {
      const colabClients = collaboratorClientMatrix.matrix[colab.colaborador_id] || {}
      Object.entries(colabClients).forEach(([clientId, hours]) => {
        const client = clients.find(c => c.id === clientId)
        rows.push([
          colab.colaborador_name,
          client?.nombre_del_negocio || 'Sin nombre',
          hours.toFixed(2),
          hours.toFixed(2), // Assuming all hours are billable for this export
        ])
      })
    })
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `control-horas-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast.success('Exportado', {
      description: 'El reporte se ha descargado correctamente.',
    })
  }

  if (error && error.message !== 'Unauthorized') {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-destructive">Error: {error.message}</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Control de horas</h1>
          <p className="text-muted-foreground mt-1">
            Analiza y controla las horas de todo el equipo
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
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
            <SelectValue placeholder="Ano" />
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

        {/* Unidad Filter */}
        <Select value={unidadFilter} onValueChange={(v) => setUnidadFilter(v as UnidadNegocio | 'all')}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Unidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las unidades</SelectItem>
            <SelectItem value="MDK">MDK</SelectItem>
            <SelectItem value="Aurelia">Aurelia</SelectItem>
            <SelectItem value="Consultoria">Consultoria</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total de horas</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {totalHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Horas facturables</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billableHours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">% Facturable</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {billablePercentage.toFixed(0)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Tables with Tabs */}
      <Tabs defaultValue="by-client" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="by-client">Por Cliente</TabsTrigger>
          <TabsTrigger value="by-collaborator">Por Colaborador</TabsTrigger>
          <TabsTrigger value="by-matrix">Colaborador x Cliente</TabsTrigger>
          <TabsTrigger value="by-day">Por Dia</TabsTrigger>
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
                      Sin datos para el periodo seleccionado
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
                  <CardTitle className="text-base">Resumen por Colaborador</CardTitle>
                </CardHeader>
                <CardContent>
                  {collaboratorSummaries.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      Sin datos para el periodo seleccionado
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {collaboratorSummaries.map((colab) => (
                        <div key={colab.colaborador_id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                          <span className="text-sm font-medium">{colab.colaborador_name}</span>
                          <div className="text-right">
                            <span className="text-sm font-semibold">{colab.hours.toFixed(1)}h</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({colab.billable_hours.toFixed(1)}h fact.)
                            </span>
                          </div>
                        </div>
                      ))}
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
            <HoursControlPanel
              month={selectedMonth}
              year={selectedYear}
              colaboradorFilter={selectedMatrixColab}
              onColaboradorFilterChange={setSelectedMatrixColab}
            />
          )}
        </TabsContent>

        <TabsContent value="by-day">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Select
                  value={selectedDayColab}
                  onValueChange={setSelectedDayColab}
                >
                  <SelectTrigger className="w-[200px]">
                    <Users className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filtrar por colaborador" />
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
              <HoursChart data={dailyHours} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
