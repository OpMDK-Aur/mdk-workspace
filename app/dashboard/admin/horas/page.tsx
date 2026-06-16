'use client'

import { useState, useMemo } from 'react'
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
import type { ClientPlan } from '@/lib/types'
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
  activo?: boolean | null
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
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user found')
  
  const [clientsRes, entriesRes, profilesRes, departamentosRes] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre_del_negocio'),
    supabase.from('entradas_de_tiempo').select('*').order('iniciado_en', { ascending: false }),
    supabase.from('colaboradores').select('id, nombre, apellido, departamento_id, activo, departamentos(id, nombre)').order('nombre'),
    supabase.from('departamentos').select('id, nombre').order('nombre'),
  ])

  return {
    clients: (clientsRes.data || []) as Client[],
    entries: (entriesRes.data || []) as TimeEntry[],
    users: (profilesRes.data || []) as User[],
    departamentos: (departamentosRes.data || []) as { id: string; nombre: string }[],
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
  const [departamentoFilter, setDepartamentoFilter] = useState<string>('all')
  const [statusColaborador, setStatusColaborador] = useState<'activos' | 'inactivos' | 'todos'>('activos')

  // Fetch data with SWR
  const { data, isLoading, error } = useSWR('control-horas-data', fetchControlHorasData)

  const clients = data?.clients || []
  const allEntries = data?.entries || []
  const users = data?.users || []
  const departamentos = data?.departamentos || []

  // Filter entries by month/year and selected collaborador/cliente
  const filteredEntries = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1))
    const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1))

    // Build a lookup of colaborador id -> departamento_id for the department filter
    const colaboradorDeptMap: Record<string, string | null> = {}
    // Build a lookup of colaborador id -> activo status for the status filter
    const colaboradorStatusMap: Record<string, boolean> = {}
    users.forEach((u: any) => {
      colaboradorDeptMap[u.id] = u.departamento_id ?? null
      colaboradorStatusMap[u.id] = u.activo ?? true
    })

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

      // Filter by selected departamento (matches the colaborador's departamento)
      if (departamentoFilter !== 'all') {
        if (colaboradorDeptMap[entry.colaborador_id] !== departamentoFilter) {
          return false
        }
      }

      // Filter by status (activos/inactivos)
      if (statusColaborador !== 'todos') {
        const isActivo = colaboradorStatusMap[entry.colaborador_id] ?? true
        if (statusColaborador === 'activos' && !isActivo) {
          return false
        }
        if (statusColaborador === 'inactivos' && isActivo) {
          return false
        }
      }
      
      return true
    })
  }, [allEntries, users, selectedMonth, selectedYear, selectedColaborador, selectedCliente, departamentoFilter, statusColaborador])

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
      .filter((user) => {
        // Only show users that have hours and match status filter
        if (!colabHoursMap[user.id]) return false
        
        const isActivo = user.activo ?? true
        if (statusColaborador === 'activos' && !isActivo) return false
        if (statusColaborador === 'inactivos' && isActivo) return false
        return true
      })
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
  }, [users, filteredEntries, statusColaborador])

  // Calculate collaborator-client matrix
  const collaboratorClientMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {}
    
    // Build map of colaborador status
    const colaboradorStatus: Record<string, boolean> = {}
    users.forEach((u) => {
      colaboradorStatus[u.id] = u.activo ?? true
    })
    
    filteredEntries.forEach((entry) => {
      if (entry.colaborador_id && entry.cliente_id) {
        // Filter by status
        const isActivo = colaboradorStatus[entry.colaborador_id] ?? true
        if (statusColaborador !== 'todos') {
          if (statusColaborador === 'activos' && !isActivo) return
          if (statusColaborador === 'inactivos' && isActivo) return
        }
        
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
  }, [filteredEntries, users, statusColaborador])

  // Per-unidad de negocio summary (uses the client's PRIMARY unidad = first in array)
  const UNIDADES = ['MDK', 'Aurelia', 'Consultoría'] as const
  const [unidadTab, setUnidadTab] = useState<'all' | (typeof UNIDADES)[number]>('all')

  const unidadSummary = useMemo(() => {
    const clientPrimaryUnidad: Record<string, string | undefined> = {}
    clients.forEach((c) => {
      clientPrimaryUnidad[c.id] = (c.unidades_negocio as string[] | undefined)?.[0]
    })

    const compute = (predicate: (clienteId: string | null) => boolean) => {
      const entries = filteredEntries.filter((e) => predicate(e.cliente_id))
      const total = entries.reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      const billable = entries
        .filter((e) => e.facturable)
        .reduce((acc, e) => acc + ((e.duracion_seg || 0) / 3600), 0)
      return { total, billable, pct: total > 0 ? (billable / total) * 100 : 0 }
    }

    return {
      all: compute(() => true),
      MDK: compute((id) => !!id && clientPrimaryUnidad[id] === 'MDK'),
      Aurelia: compute((id) => !!id && clientPrimaryUnidad[id] === 'Aurelia'),
      'Consultoría': compute((id) => !!id && clientPrimaryUnidad[id] === 'Consultoría'),
    }
  }, [filteredEntries, clients])

  const currentSummary = unidadSummary[unidadTab]

  // Clients grouped by the active unidad tab, with the breakdown of involved collaborators.
  // filteredEntries already respects month / colaborador / cliente / departamento filters.
  const clientesPorUnidad = useMemo(() => {
    const clientPrimaryUnidad: Record<string, string | undefined> = {}
    clients.forEach((c) => {
      clientPrimaryUnidad[c.id] = (c.unidades_negocio as string[] | undefined)?.[0]
    })

    // Build map of colaborador status
    const colaboradorStatus: Record<string, boolean> = {}
    users.forEach((u) => {
      colaboradorStatus[u.id] = u.activo ?? true
    })

    const userName = (id: string) => {
      const u = users.find((x) => x.id === id)
      return u ? `${u.nombre}${u.apellido ? ` ${u.apellido}` : ''}` : 'Desconocido'
    }
    const clientName = (id: string) => {
      const c = clients.find((x) => x.id === id)
      return c?.nombre_del_negocio || c?.business_name || 'Sin nombre'
    }

    // cliente_id -> { total, colaboradores: { colab_id -> hours } }
    const map: Record<string, { hours: number; colaboradores: Record<string, number> }> = {}

    filteredEntries.forEach((entry) => {
      const cid = entry.cliente_id
      if (!cid || !entry.colaborador_id) return
      // Filter by active unidad tab (using the client's PRIMARY unidad)
      if (unidadTab !== 'all' && clientPrimaryUnidad[cid] !== unidadTab) return

      // Double-check status filter here (should already be in filteredEntries, but be explicit)
      const isActivo = colaboradorStatus[entry.colaborador_id] ?? true
      if (statusColaborador !== 'todos') {
        if (statusColaborador === 'activos' && !isActivo) return
        if (statusColaborador === 'inactivos' && isActivo) return
      }

      if (!map[cid]) map[cid] = { hours: 0, colaboradores: {} }
      const hours = (entry.duracion_seg || 0) / 3600
      map[cid].hours += hours
      map[cid].colaboradores[entry.colaborador_id] =
        (map[cid].colaboradores[entry.colaborador_id] || 0) + hours
    })

    return Object.entries(map)
      .map(([cid, data]) => ({
        client_id: cid,
        client_name: clientName(cid),
        hours: data.hours,
        colaboradores: Object.entries(data.colaboradores)
          .map(([colabId, hrs]) => ({
            colaborador_id: colabId,
            colaborador_name: userName(colabId),
            hours: hrs,
          }))
          .sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [clients, users, filteredEntries, unidadTab, statusColaborador])

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
            {users
              .filter(user => {
                if (statusColaborador === 'todos') return true
                const isActivo = user.activo ?? true
                return statusColaborador === 'activos' ? isActivo : !isActivo
              })
              .map((user) => (
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

        {/* Departamento Filter */}
        <Select value={departamentoFilter} onValueChange={(v) => setDepartamentoFilter(v)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los departamentos</SelectItem>
            {departamentos.map((dep) => (
              <SelectItem key={dep.id} value={dep.id}>
                {dep.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={statusColaborador} onValueChange={(v) => {
          setStatusColaborador(v as 'activos' | 'inactivos' | 'todos')
          // Reset colaborador filter when status changes to avoid showing wrong data
          setSelectedColaborador('all')
        }}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary by Unidad de Negocio */}
      <Tabs value={unidadTab} onValueChange={(v) => setUnidadTab(v as typeof unidadTab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="MDK">MDK</TabsTrigger>
          <TabsTrigger value="Aurelia">Aurelia</TabsTrigger>
          <TabsTrigger value="Consultoría">Consultoría</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total de horas</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {currentSummary.total.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Horas facturables</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {currentSummary.billable.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">% Facturable</div>
            <div className="text-3xl font-bold text-foreground mt-1">
              {currentSummary.pct.toFixed(0)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Tables with Tabs */}
      <Tabs defaultValue="hours-control" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="hours-control">Colaboradores</TabsTrigger>
          <TabsTrigger value="clients-by-unit">Clientes</TabsTrigger>
        </TabsList>

        {/* Hours Control Panel - The main view with progress bars */}
        <TabsContent value="hours-control">
          <HoursControlPanel 
            month={selectedMonth} 
            year={selectedYear}
            colaboradorId={selectedColaborador !== 'all' ? selectedColaborador : undefined}
            clienteId={selectedCliente !== 'all' ? selectedCliente : undefined}
            departamento={departamentoFilter}
            statusColaborador={statusColaborador}
          />
        </TabsContent>

        {/* Clients grouped by the active unidad de negocio tab */}
        <TabsContent value="clients-by-unit">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : clientesPorUnidad.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No hay clientes con marcaciones para los filtros seleccionados
                {unidadTab !== 'all' ? ` en ${unidadTab}` : ''}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {clientesPorUnidad.map((client) => (
                <Card key={client.client_id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {client.client_name}
                      </CardTitle>
                      <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                        {client.hours.toFixed(1)}h
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Colaboradores implicados ({client.colaboradores.length})
                    </div>
                    <ul className="divide-y divide-border">
                      {client.colaboradores.map((colab) => (
                        <li
                          key={colab.colaborador_id}
                          className="flex items-center justify-between py-2"
                        >
                          <span className="flex items-center gap-2 text-sm text-foreground">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {colab.colaborador_name}
                          </span>
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {colab.hours.toFixed(1)}h
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        
      </Tabs>
    </div>
  )
}
