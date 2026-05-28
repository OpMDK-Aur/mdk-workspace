'use client'

import { useState, useEffect, useMemo } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Download, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getServiceMapKPIs, createMissingTasks } from '@/lib/service-map'
import type { ServiceMapKPIs, ClientPlan } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Colaborador {
  id: string
  nombre: string
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const PLAN_COLORS: Record<ClientPlan, string> = {
  Esencial: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  Estrategico: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
}

export function ServiceMapReport() {
  const [kpis, setKpis] = useState<ServiceMapKPIs[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [planFilter, setPlanFilter] = useState<ClientPlan | 'all'>('all')
  const [pmFilter, setPmFilter] = useState<string>('all')
  const [amFilter, setAmFilter] = useState<string>('all')

  // Colaboradores for filters
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])

  // Years for selector
  const years = useMemo(() => {
    const currentYear = now.getFullYear()
    return [currentYear - 1, currentYear, currentYear + 1]
  }, [])

  // Load colaboradores
  useEffect(() => {
    async function loadColaboradores() {
      const supabase = createClient()
      const { data } = await supabase
        .from('colaboradores')
        .select('id, nombre')
        .order('nombre')
      if (data) setColaboradores(data)
    }
    loadColaboradores()
  }, [])

  // Fetch KPIs when filters change
  useEffect(() => {
    async function fetchKPIs() {
      setLoading(true)
      setError(null)

      // For current month, retroactively create any missing tasks
      const now = new Date()
      const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()
      if (isCurrentMonth) {
        try {
          await createMissingTasks(selectedMonth, selectedYear)
        } catch (err) {
          console.error('[service-map] createMissingTasks error:', err)
        }
      }

      const result = await getServiceMapKPIs({
        mes: selectedMonth,
        anio: selectedYear,
        planFilter: planFilter === 'all' ? undefined : planFilter,
        pmFilter: pmFilter === 'all' ? undefined : pmFilter,
        amFilter: amFilter === 'all' ? undefined : amFilter,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setKpis(result.data || [])
      }

      setLoading(false)
    }

    fetchKPIs()
  }, [selectedMonth, selectedYear, planFilter, pmFilter, amFilter])

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

  // Summary stats
  const totalClients = kpis.length
  const avgProgress = totalClients > 0 
    ? Math.round(kpis.reduce((acc, k) => acc + k.progresoPercent, 0) / totalClients) 
    : 0
  const avgCumplimiento = totalClients > 0 
    ? Math.round(kpis.reduce((acc, k) => acc + k.cumplimientoPercent, 0) / totalClients) 
    : 0
  const avgChecklistRate = totalClients > 0 
    ? Math.round(kpis.reduce((acc, k) => acc + k.checklistCompletoPercent, 0) / totalClients) 
    : 0
  const clientsAbove80 = kpis.filter(k => k.cumplimientoPercent >= 80).length
  const totalNoRealizados = kpis.reduce((acc, k) => acc + k.noRealizados, 0)

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Cliente', 'Plan', 'Completados', 'No Realizados', 'Pendientes', 'Total', 'Progreso %', 'Cumplimiento %', 'Checklist Completo %', 'Ultimo Hito', 'Fecha']
    const rows = kpis.map(k => [
      k.clientName,
      k.plan,
      k.completados,
      k.noRealizados,
      k.pendientes,
      k.totalHitos,
      k.progresoPercent,
      k.cumplimientoPercent,
      k.checklistCompletoPercent,
      k.ultimoHito || '',
      k.ultimaFecha || '',
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `mapa-servicio-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Get PM/AM name
  const getColabName = (id: string | null) => {
    if (!id) return '-'
    const colab = colaboradores.find(c => c.id === id)
    return colab?.nombre || '-'
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Month navigation */}
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

        <div className="h-6 w-px bg-border" />

        {/* Plan filter */}
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as ClientPlan | 'all')}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
                  <SelectItem value="Esencial">Esencial</SelectItem>
                  <SelectItem value="Estrategico">Estrategico</SelectItem>
          </SelectContent>
        </Select>

        {/* PM filter */}
        <Select value={pmFilter} onValueChange={setPmFilter}>
          <SelectTrigger className="w-[150px] h-8 text-sm">
            <SelectValue placeholder="PM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los PM</SelectItem>
            {colaboradores.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* AM filter */}
        <Select value={amFilter} onValueChange={setAmFilter}>
          <SelectTrigger className="w-[150px] h-8 text-sm">
            <SelectValue placeholder="AM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los AM</SelectItem>
            {colaboradores.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {/* Export */}
        <Button variant="outline" size="sm" className="h-8 gap-2" onClick={exportToCSV} disabled={kpis.length === 0}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Clientes</div>
          <div className="text-2xl font-bold mt-1">{totalClients}</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Cumplimiento Promedio</div>
          <div className={cn(
            'text-2xl font-bold mt-1',
            avgCumplimiento >= 80 && 'text-emerald-600',
            avgCumplimiento < 50 && 'text-red-600'
          )}>
            {avgCumplimiento}%
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Progreso Actual</div>
          <div className="text-2xl font-bold mt-1">{avgProgress}%</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">No Realizados</div>
          <div className={cn(
            'text-2xl font-bold mt-1',
            totalNoRealizados > 0 && 'text-red-600'
          )}>
            {totalNoRealizados}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Clientes &gt;80%</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{clientsAbove80}</div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-sm text-destructive p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          Error: {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : kpis.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No hay datos de mapa de servicio para este periodo.</p>
        </div>
      ) : (
        /* Table */
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-center">Listo</TableHead>
                <TableHead className="text-center">No Realizado</TableHead>
                <TableHead className="text-center">Pendiente</TableHead>
                <TableHead className="text-center">Cumplimiento</TableHead>
                <TableHead className="text-center">Checklist</TableHead>
                <TableHead>Ultimo Hito</TableHead>
                <TableHead>AM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpis.map((kpi) => (
                <TableRow key={kpi.clientId}>
                  <TableCell className="font-medium">{kpi.clientName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', PLAN_COLORS[kpi.plan])}>
                      {kpi.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-emerald-600 font-medium">{kpi.completados}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    {kpi.noRealizados > 0 ? (
                      <span className="text-red-600 font-medium">{kpi.noRealizados}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {kpi.pendientes > 0 ? (
                      <span className="text-amber-600 font-medium">{kpi.pendientes}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={kpi.cumplimientoPercent} className="h-2 w-20" />
                      <span className={cn(
                        'text-sm font-medium',
                        kpi.cumplimientoPercent >= 80 && 'text-emerald-600',
                        kpi.cumplimientoPercent < 50 && 'text-red-600'
                      )}>
                        {kpi.cumplimientoPercent}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {kpi.checklistCompletoPercent === 100 ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : kpi.checklistCompletoPercent < 50 ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : null}
                      <span className={cn(
                        'text-sm',
                        kpi.checklistCompletoPercent === 100 && 'text-emerald-600',
                        kpi.checklistCompletoPercent < 50 && 'text-amber-600'
                      )}>
                        {kpi.checklistCompletoPercent}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {kpi.ultimoHito || '-'}
                    {kpi.ultimaFecha && (
                      <span className="text-xs block">{new Date(kpi.ultimaFecha).toLocaleDateString('es-AR')}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{getColabName(kpi.accountManagerId)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
