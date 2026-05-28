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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Download, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Client, ClientPlan } from '@/lib/types'

interface NPSHistorial {
  id: string
  cliente_id: string
  score: number
  comentario: string | null
  fecha: string
  encuestado_nombre: string | null
  encuestado_cargo: string | null
  created_at: string
}

interface ClientNPSData {
  clientId: string
  clientName: string
  plan: ClientPlan | null
  currentScore: number | null
  previousScore: number | null
  trend: 'up' | 'down' | 'stable' | 'new'
  historicalScores: { mes: string; score: number }[]
  lastSurveyDate: string | null
  totalEncuestas: number
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const PLAN_COLORS: Record<ClientPlan, string> = {
  Esencial: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  Estrategico: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
}

const NPS_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  5: { bg: 'bg-emerald-500', text: 'text-emerald-600', label: 'Excelente' },
  4: { bg: 'bg-green-500', text: 'text-green-600', label: 'Bueno' },
  3: { bg: 'bg-yellow-500', text: 'text-yellow-600', label: 'Regular' },
  2: { bg: 'bg-orange-500', text: 'text-orange-600', label: 'Malo' },
  1: { bg: 'bg-red-500', text: 'text-red-600', label: 'Muy malo' },
}

export function NPSReport() {
  const [clients, setClients] = useState<Client[]>([])
  const [npsHistorial, setNpsHistorial] = useState<NPSHistorial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [planFilter, setPlanFilter] = useState<ClientPlan | 'all'>('all')

  // Years for selector
  const years = useMemo(() => {
    const currentYear = now.getFullYear()
    return [currentYear - 1, currentYear, currentYear + 1]
  }, [])

  // Fetch data when filters change
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      const supabase = createClient()

      try {
        // Fetch clients
        const { data: clientsData, error: clientsError } = await supabase
          .from('clientes')
          .select('*')
          .order('nombre_del_negocio')

        if (clientsError) throw clientsError

        // Fetch all NPS history (last 12 months)
        const startDate = new Date(selectedYear - 1, selectedMonth - 1, 1)
        const { data: npsData, error: npsError } = await supabase
          .from('cliente_nps_historial')
          .select('*')
          .gte('fecha', startDate.toISOString().split('T')[0])
          .order('fecha', { ascending: false })

        if (npsError) throw npsError

        setClients(clientsData || [])
        setNpsHistorial(npsData || [])
      } catch (err) {
        console.error('[v0] Error fetching NPS data:', err)
        setError(err instanceof Error ? err.message : 'Error al cargar datos')
      }

      setLoading(false)
    }

    fetchData()
  }, [selectedMonth, selectedYear])

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

  // Process client NPS data
  const clientNPSData: ClientNPSData[] = useMemo(() => {
    const filteredClients = planFilter === 'all' 
      ? clients 
      : clients.filter(c => c.plan === planFilter)

    return filteredClients.map(client => {
      const clientHistory = npsHistorial.filter(h => h.cliente_id === client.id)
      
      // Current month score
      const currentMonthRecords = clientHistory.filter(h => {
        const date = new Date(h.fecha)
        return date.getMonth() + 1 === selectedMonth && date.getFullYear() === selectedYear
      })
      const currentScore = currentMonthRecords.length > 0
        ? Math.round(currentMonthRecords.reduce((sum, r) => sum + r.score, 0) / currentMonthRecords.length)
        : null

      // Previous month score
      const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
      const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
      const prevMonthRecords = clientHistory.filter(h => {
        const date = new Date(h.fecha)
        return date.getMonth() + 1 === prevMonth && date.getFullYear() === prevYear
      })
      const previousScore = prevMonthRecords.length > 0
        ? Math.round(prevMonthRecords.reduce((sum, r) => sum + r.score, 0) / prevMonthRecords.length)
        : null

      // Trend
      let trend: 'up' | 'down' | 'stable' | 'new' = 'new'
      if (currentScore !== null && previousScore !== null) {
        if (currentScore > previousScore) trend = 'up'
        else if (currentScore < previousScore) trend = 'down'
        else trend = 'stable'
      }

      // Historical scores (last 6 months)
      const historicalScores: { mes: string; score: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const m = ((selectedMonth - 1 - i + 12) % 12) + 1
        const y = selectedMonth - i <= 0 ? selectedYear - 1 : selectedYear
        const monthRecords = clientHistory.filter(h => {
          const date = new Date(h.fecha)
          return date.getMonth() + 1 === m && date.getFullYear() === y
        })
        if (monthRecords.length > 0) {
          const avgScore = Math.round(monthRecords.reduce((sum, r) => sum + r.score, 0) / monthRecords.length)
          historicalScores.push({ mes: MONTHS[m - 1].substring(0, 3), score: avgScore })
        } else {
          historicalScores.push({ mes: MONTHS[m - 1].substring(0, 3), score: 0 })
        }
      }

      // Last survey date
      const lastSurvey = clientHistory[0]
      
      return {
        clientId: client.id,
        clientName: client.nombre_del_negocio,
        plan: client.plan || null,
        currentScore,
        previousScore,
        trend,
        historicalScores,
        lastSurveyDate: lastSurvey?.fecha || null,
        totalEncuestas: clientHistory.length,
      }
    }).sort((a, b) => {
      // Sort by current score (null at the end), then by name
      if (a.currentScore === null && b.currentScore === null) return a.clientName.localeCompare(b.clientName)
      if (a.currentScore === null) return 1
      if (b.currentScore === null) return -1
      return b.currentScore - a.currentScore
    })
  }, [clients, npsHistorial, selectedMonth, selectedYear, planFilter])

  // Summary stats
  const clientsWithNPS = clientNPSData.filter(c => c.currentScore !== null)
  const avgNPS = clientsWithNPS.length > 0
    ? (clientsWithNPS.reduce((sum, c) => sum + (c.currentScore || 0), 0) / clientsWithNPS.length).toFixed(1)
    : '-'
  const promoters = clientsWithNPS.filter(c => c.currentScore && c.currentScore >= 4).length
  const detractors = clientsWithNPS.filter(c => c.currentScore && c.currentScore <= 2).length
  const npsScore = clientsWithNPS.length > 0
    ? Math.round(((promoters - detractors) / clientsWithNPS.length) * 100)
    : 0

  // Distribution
  const distribution = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    clientsWithNPS.forEach(c => {
      if (c.currentScore) counts[c.currentScore as keyof typeof counts]++
    })
    const total = clientsWithNPS.length || 1
    return Object.entries(counts).reverse().map(([score, count]) => ({
      score: parseInt(score),
      count,
      percentage: Math.round((count / total) * 100),
      ...NPS_COLORS[parseInt(score)],
    }))
  }, [clientsWithNPS])

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Cliente', 'Plan', 'NPS Actual', 'NPS Anterior', 'Tendencia', 'Total Encuestas', 'Ultima Encuesta']
    const rows = clientNPSData.map(c => [
      c.clientName,
      c.plan || '-',
      c.currentScore ?? '-',
      c.previousScore ?? '-',
      c.trend === 'up' ? 'Subió' : c.trend === 'down' ? 'Bajó' : c.trend === 'stable' ? 'Estable' : 'Nuevo',
      c.totalEncuestas,
      c.lastSurveyDate || '-',
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `nps-report-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' | 'new' }) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-emerald-500" />
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />
    if (trend === 'stable') return <Minus className="h-4 w-4 text-muted-foreground" />
    return null
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

        <div className="flex-1" />

        {/* Export */}
        <Button variant="outline" size="sm" className="h-8 gap-2" onClick={exportToCSV} disabled={clientNPSData.length === 0}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Clientes Encuestados</div>
            <div className="text-2xl font-bold mt-1">{clientsWithNPS.length}/{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">NPS Promedio</div>
            <div className="text-2xl font-bold mt-1">{avgNPS}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Score NPS</div>
            <div className={cn(
              "text-2xl font-bold mt-1",
              npsScore >= 50 && "text-emerald-600",
              npsScore < 0 && "text-red-600"
            )}>
              {npsScore}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Promotores (4-5)</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600">{promoters}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Detractores (1-2)</div>
            <div className={cn(
              "text-2xl font-bold mt-1",
              detractors > 0 ? "text-red-600" : "text-muted-foreground"
            )}>
              {detractors}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribucion de Puntuaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {distribution.map((d) => (
              <div key={d.score} className="flex items-center gap-3">
                <div className="w-20 text-sm font-medium flex items-center gap-2">
                  <span className={cn("w-3 h-3 rounded-full", d.bg)} />
                  {d.label}
                </div>
                <div className="flex-1">
                  <Progress value={d.percentage} className="h-2" />
                </div>
                <div className="w-16 text-sm text-right text-muted-foreground">
                  {d.count} ({d.percentage}%)
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
      ) : clientNPSData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No hay datos de NPS para este periodo.</p>
        </div>
      ) : (
        /* Table */
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-center">NPS Actual</TableHead>
                <TableHead className="text-center">NPS Anterior</TableHead>
                <TableHead className="text-center">Tendencia</TableHead>
                <TableHead>Historico (6 meses)</TableHead>
                <TableHead className="text-center">Encuestas</TableHead>
                <TableHead>Ultima Encuesta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientNPSData.map((data) => (
                <TableRow key={data.clientId}>
                  <TableCell className="font-medium">{data.clientName}</TableCell>
                  <TableCell>
                    {data.plan ? (
                      <Badge variant="outline" className={cn('text-xs', PLAN_COLORS[data.plan])}>
                        {data.plan}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {data.currentScore !== null ? (
                      <Badge className={cn('text-xs font-bold', NPS_COLORS[data.currentScore]?.bg)}>
                        {data.currentScore}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {data.previousScore !== null ? (
                      <span className={cn('text-sm font-medium', NPS_COLORS[data.previousScore]?.text)}>
                        {data.previousScore}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center">
                      <TrendIcon trend={data.trend} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-end gap-1 h-6">
                      {data.historicalScores.map((h, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center"
                          title={`${h.mes}: ${h.score || '-'}`}
                        >
                          <div
                            className={cn(
                              "w-4 rounded-t",
                              h.score > 0 ? NPS_COLORS[h.score]?.bg : "bg-muted"
                            )}
                            style={{ height: h.score > 0 ? `${(h.score / 5) * 24}px` : '4px' }}
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {data.totalEncuestas}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {data.lastSurveyDate ? new Date(data.lastSurveyDate).toLocaleDateString('es-AR') : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
