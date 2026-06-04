'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Download, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getServiceMapKPIs, createMissingTasks } from '@/lib/service-map'
import type { ServiceMapKPIs, ClientPlan } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Colaborador {
  id: string
  nombre: string
}

const PLAN_COLORS: Record<ClientPlan, string> = {
  Esencial: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  Estrategico: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
}

interface ServiceMapReportProps {
  month: number
  year: number
}

export function ServiceMapReport({ month, year }: ServiceMapReportProps) {
  const [kpis, setKpis] = useState<ServiceMapKPIs[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Use props for month/year
  const selectedMonth = month
  const selectedYear = year

  // Colaboradores for name lookups
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])

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
          console.log('[v0] Calling createMissingTasks for', { selectedMonth, selectedYear })
          const taskResult = await createMissingTasks(selectedMonth, selectedYear)
          console.log('[v0] createMissingTasks result:', taskResult)
        } catch (err) {
          console.error('[v0] createMissingTasks error:', err)
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
  }, [selectedMonth, selectedYear])

  // Check if viewing current month
  const now = new Date()
  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()

  // Summary stats
  const totalClients = kpis.length
  const avgProgress = totalClients > 0 
    ? Math.round(kpis.reduce((acc, k) => acc + k.progresoPercent, 0) / totalClients) 
    : 0
  const avgChecklistRate = totalClients > 0 
    ? Math.round(kpis.reduce((acc, k) => acc + k.checklistCompletoPercent, 0) / totalClients) 
    : 0
  const clientsAbove80 = kpis.filter(k => k.progresoPercent >= 80).length
  const totalNoRealizados = kpis.reduce((acc, k) => acc + k.noRealizados, 0)

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Cliente', 'Plan', 'Completados', 'No Realizados', 'Total', 'Progreso %', 'Checklist Completo %', 'Ultimo Hito', 'Fecha']
    const rows = kpis.map(k => [
      k.clientName,
      k.plan,
      k.completados,
      k.noRealizados,
      k.totalHitos,
      k.progresoPercent,
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
          <div className="text-sm text-muted-foreground">Progreso Promedio</div>
          <div className="text-2xl font-bold mt-1">{avgProgress}%</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Checklist Completo</div>
          <div className="text-2xl font-bold mt-1">{avgChecklistRate}%</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">Clientes &gt;80%</div>
          <div className="text-2xl font-bold mt-1 text-emerald-600">{clientsAbove80}</div>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">No Realizados</div>
          <div className={cn(
            "text-2xl font-bold mt-1",
            totalNoRealizados > 0 ? "text-red-600" : "text-muted-foreground"
          )}>
            {totalNoRealizados}
          </div>
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
                <TableHead className="text-center">Completados</TableHead>
                <TableHead className="text-center">No Realizados</TableHead>
                <TableHead className="text-center">Progreso</TableHead>
                <TableHead className="text-center">Checklist</TableHead>
                <TableHead>Ultimo Hito</TableHead>
                <TableHead>PM</TableHead>
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
                    {kpi.completados}/{kpi.totalHitos}
                  </TableCell>
                  <TableCell className="text-center">
                    {kpi.noRealizados > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-red-600 font-medium">{kpi.noRealizados}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={kpi.progresoPercent} className="h-2 w-20" />
                      <span className={cn(
                        'text-sm font-medium',
                        kpi.progresoPercent >= 80 && 'text-emerald-600',
                        kpi.progresoPercent < 50 && 'text-amber-600'
                      )}>
                        {kpi.progresoPercent}%
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
                  <TableCell className="text-sm">{getColabName(kpi.projectManagerId)}</TableCell>
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
