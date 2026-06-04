'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Download, TrendingUp, TrendingDown, Minus, AlertTriangle, BellOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Client, ClientPlan, Profile, UnidadNegocio } from '@/lib/types'

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
  unidadesNegocio: UnidadNegocio[] | null
  accountManagerId: string | null
  accountManagerName: string | null
  currentScore: number | null
  previousScore: number | null
  responded: boolean
  trend: 'up' | 'down' | 'stable' | 'new'
  observation: string | null
  historicalScores: { mes: string; score: number }[]
  totalEncuestas: number
  ultimaEncuesta: string | null
}

interface ACData {
  id: string
  name: string
  clients: ClientNPSData[]
  totalClients: number
  respondedCount: number
  avgWithRule: number // Con regla (0 si no respondió)
  avgOnlyResponded: number // Solo respondientes
}

const NPS_COLORS: Record<number, { bg: string; text: string }> = {
  5: { bg: 'bg-emerald-500', text: 'text-emerald-600' },
  4: { bg: 'bg-green-500', text: 'text-green-600' },
  3: { bg: 'bg-lime-500', text: 'text-lime-600' },
  2: { bg: 'bg-yellow-500', text: 'text-yellow-600' },
  1: { bg: 'bg-orange-500', text: 'text-orange-600' },
  0: { bg: 'bg-red-500', text: 'text-red-600' },
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const getNPSBadgeClass = (score: number | null): string => {
  if (score === null) return 'bg-muted text-muted-foreground'
  if (score >= 4) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
  if (score === 3) return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  if (score === 2) return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
  return 'bg-red-500/10 text-red-600 border-red-500/20'
}

const getNPSColor = (score: number): string => {
  if (score >= 4) return 'text-emerald-600'
  if (score >= 3) return 'text-amber-600'
  if (score >= 2) return 'text-orange-600'
  return 'text-red-600'
}

interface NPSReportProps {
  month: number
  year: number
  planFilter?: ClientPlan | 'all'
  unidadFilter?: UnidadNegocio | 'all'
}

export function NPSReport({ month, year, planFilter = 'all', unidadFilter = 'all' }: NPSReportProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [npsHistorial, setNpsHistorial] = useState<NPSHistorial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('todos')

  // Use props for month/year
  const selectedMonth = month
  const selectedYear = year

  // Fetch data
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
          .eq('activo', true)
          .order('nombre_del_negocio')

        if (clientsError) throw clientsError

        // Fetch profiles for AC names
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')

        if (profilesError) throw profilesError

        // Fetch NPS history (last 12 months)
        const startDate = new Date(selectedYear - 1, selectedMonth - 1, 1)
        const { data: npsData, error: npsError } = await supabase
          .from('cliente_nps_historial')
          .select('*')
          .gte('fecha', startDate.toISOString().split('T')[0])
          .order('fecha', { ascending: false })

        if (npsError) throw npsError

        setClients(clientsData || [])
        setProfiles(profilesData || [])
        setNpsHistorial(npsData || [])
      } catch (err) {
        console.error('[v0] Error fetching NPS data:', err)
        setError(err instanceof Error ? err.message : 'Error al cargar datos')
      }

      setLoading(false)
    }

    fetchData()
  }, [selectedMonth, selectedYear])

  // Check if viewing current month
  const now = new Date()
  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()

  // Get profile name
  const getProfileName = (id: string | null): string | null => {
    if (!id) return null
    const profile = profiles.find(p => p.id === id)
    return profile?.full_name || null
  }

  // Process client NPS data
  const clientNPSData: ClientNPSData[] = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Filter clients: must have fecha_activacion AND it must be before today
    let filteredClients = clients.filter(c => {
      // Exclude clients without fecha_activacion
      if (!c.fecha_activacion) return false
      const activationDate = new Date(c.fecha_activacion)
      activationDate.setHours(0, 0, 0, 0)
      return activationDate < today
    })
    
    if (planFilter !== 'all') {
      filteredClients = filteredClients.filter(c => c.plan === planFilter)
    }
    
    if (unidadFilter !== 'all') {
      // Aurelia incluye también Tecnología
      const unidadesToInclude: UnidadNegocio[] = unidadFilter === 'Aurelia' 
        ? ['Aurelia', 'Tecnología'] 
        : [unidadFilter]
      filteredClients = filteredClients.filter(c => 
        c.unidades_negocio?.some(u => unidadesToInclude.includes(u))
      )
    }

    return filteredClients.map(client => {
      const clientHistory = npsHistorial.filter(h => h.cliente_id === client.id)
      
      // Current month score
      const currentMonthRecords = clientHistory.filter(h => {
        const date = new Date(h.fecha)
        return date.getUTCMonth() + 1 === selectedMonth && date.getUTCFullYear() === selectedYear
      })
      const currentScore = currentMonthRecords.length > 0
        ? Math.round(currentMonthRecords.reduce((sum, r) => sum + r.score, 0) / currentMonthRecords.length)
        : null

      // Previous month score
      const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
      const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
      const prevMonthRecords = clientHistory.filter(h => {
        const date = new Date(h.fecha)
        return date.getUTCMonth() + 1 === prevMonth && date.getUTCFullYear() === prevYear
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
        let targetMonth = selectedMonth - i
        let targetYear = selectedYear
        while (targetMonth <= 0) {
          targetMonth += 12
          targetYear -= 1
        }
        const monthRecords = clientHistory.filter(h => {
          const date = new Date(h.fecha)
          return date.getUTCMonth() + 1 === targetMonth && date.getUTCFullYear() === targetYear
        })
        if (monthRecords.length > 0) {
          const avgScore = Math.round(monthRecords.reduce((sum, r) => sum + r.score, 0) / monthRecords.length)
          historicalScores.push({ mes: MONTHS[targetMonth - 1].substring(0, 3), score: avgScore })
        } else {
          historicalScores.push({ mes: MONTHS[targetMonth - 1].substring(0, 3), score: -1 })
        }
      }

      // Total encuestas and ultima encuesta
      const totalEncuestas = clientHistory.length
      const ultimaEncuesta = clientHistory.length > 0 
        ? clientHistory.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0].fecha
        : null

      // Get observation from comment
      const latestRecord = currentMonthRecords[0]
      
      return {
        clientId: client.id,
        clientName: client.nombre_del_negocio,
        plan: client.plan || null,
        unidadesNegocio: client.unidades_negocio || null,
        accountManagerId: client.account_manager_id,
        accountManagerName: getProfileName(client.account_manager_id),
        currentScore,
        previousScore,
        responded: currentScore !== null,
        trend,
        observation: latestRecord?.comentario || null,
        historicalScores,
        totalEncuestas,
        ultimaEncuesta,
      }
    })
  }, [clients, npsHistorial, selectedMonth, selectedYear, planFilter, unidadFilter, profiles])

  // Group by Account Manager
  const acData: ACData[] = useMemo(() => {
    const grouped = new Map<string, ClientNPSData[]>()
    
    clientNPSData.forEach(client => {
      const acId = client.accountManagerId || 'sin-asignar'
      if (!grouped.has(acId)) {
        grouped.set(acId, [])
      }
      grouped.get(acId)!.push(client)
    })

    return Array.from(grouped.entries()).map(([acId, acClients]) => {
      const respondedClients = acClients.filter(c => c.responded)
      const totalScore = acClients.reduce((sum, c) => sum + (c.currentScore ?? 0), 0)
      const respondedScore = respondedClients.reduce((sum, c) => sum + (c.currentScore ?? 0), 0)

      return {
        id: acId,
        name: acId === 'sin-asignar' ? 'Sin AC asignado' : (getProfileName(acId) || 'Desconocido'),
        clients: acClients.sort((a, b) => (b.currentScore ?? -1) - (a.currentScore ?? -1)),
        totalClients: acClients.length,
        respondedCount: respondedClients.length,
        avgWithRule: acClients.length > 0 ? totalScore / acClients.length : 0,
        avgOnlyResponded: respondedClients.length > 0 ? respondedScore / respondedClients.length : 0,
      }
    }).sort((a, b) => b.avgOnlyResponded - a.avgOnlyResponded)
  }, [clientNPSData])

  // Filtered data for tabs
  const filteredData = useMemo(() => {
    switch (activeTab) {
      case 'riesgo':
        return clientNPSData.filter(c => c.currentScore !== null && c.currentScore <= 3)
      case 'noResp':
        return clientNPSData.filter(c => !c.responded)
      case 'bajaron':
        return clientNPSData.filter(c => c.trend === 'down')
      default:
        return clientNPSData
    }
  }, [clientNPSData, activeTab])

  // Summary stats
  const totalClients = clientNPSData.length
  const respondedClients = clientNPSData.filter(c => c.responded)
  const avgWithRule = totalClients > 0 
    ? (clientNPSData.reduce((sum, c) => sum + (c.currentScore ?? 0), 0) / totalClients).toFixed(2)
    : '-'
  const avgOnlyResponded = respondedClients.length > 0
    ? (respondedClients.reduce((sum, c) => sum + (c.currentScore ?? 0), 0) / respondedClients.length).toFixed(2)
    : '-'

  // Stats por unidad de negocio (sin filtro de unidad aplicado)
  // Nota: Tecnología y Aurelia son lo mismo, así que unificamos
  const statsByUnidad = useMemo(() => {
    const unidadesDisplay: { key: string; label: string; includes: UnidadNegocio[] }[] = [
      { key: 'MDK', label: 'MDK', includes: ['MDK'] },
      { key: 'Aurelia', label: 'Aurelia', includes: ['Aurelia', 'Tecnología'] },
      { key: 'Consultoría', label: 'Consultoría', includes: ['Consultoría'] },
    ]
    
    // Recalcular sin el filtro de unidad para mostrar todas las unidades
    const allClientsFiltered = planFilter === 'all' 
      ? clients 
      : clients.filter(c => c.plan === planFilter)

    return unidadesDisplay.map(({ key, label, includes }) => {
      const unidadClients = allClientsFiltered.filter(c => 
        c.unidades_negocio?.some(u => includes.includes(u))
      )
      
      const clientsWithNPS = unidadClients.map(client => {
        const clientHistory = npsHistorial.filter(h => h.cliente_id === client.id)
        const currentMonthRecords = clientHistory.filter(h => {
          const date = new Date(h.fecha)
          return date.getUTCMonth() + 1 === selectedMonth && date.getUTCFullYear() === selectedYear
        })
        const currentScore = currentMonthRecords.length > 0
          ? Math.round(currentMonthRecords.reduce((sum, r) => sum + r.score, 0) / currentMonthRecords.length)
          : null
        return { clientId: client.id, currentScore, responded: currentScore !== null }
      })

      const responded = clientsWithNPS.filter(c => c.responded)
      const totalScore = clientsWithNPS.reduce((sum, c) => sum + (c.currentScore ?? 0), 0)
      const respondedScore = responded.reduce((sum, c) => sum + (c.currentScore ?? 0), 0)

      return {
        unidad: label,
        totalClients: clientsWithNPS.length,
        respondedCount: responded.length,
        avgWithRule: clientsWithNPS.length > 0 ? (totalScore / clientsWithNPS.length).toFixed(2) : '-',
        avgOnlyResponded: responded.length > 0 ? (respondedScore / responded.length).toFixed(2) : '-',
      }
    })
  }, [clients, npsHistorial, selectedMonth, selectedYear, planFilter])

  // Export CSV
  const exportToCSV = () => {
    const headers = ['Cliente', 'AC / Responsable', 'Plan', 'NPS Actual', 'Respondió', 'NPS Anterior', 'Tendencia', 'Observación']
    const rows = clientNPSData.map(c => [
      c.clientName,
      c.accountManagerName || '-',
      c.plan || '-',
      c.currentScore ?? '-',
      c.responded ? 'Sí' : 'No',
      c.previousScore ?? '-',
      c.trend === 'up' ? 'Subió' : c.trend === 'down' ? 'Bajó' : c.trend === 'stable' ? 'Estable' : '-',
      c.observation || '-',
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
    return <span className="text-muted-foreground text-xs">-</span>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="h-8 gap-2" onClick={exportToCSV} disabled={clientNPSData.length === 0}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Nota explicativa */}
      <div className="bg-muted/50 border rounded-lg p-4 text-sm text-muted-foreground">
        <strong>Como se calcula:</strong> Los NPS se extraen de la base de datos. Escala 0-5. 
        La <strong>regla oficial</strong> asigna 0 a los clientes que no respondieron la encuesta. 
        El puntaje &quot;Solo respondientes&quot; considera unicamente a los que si respondieron. 
        Objetivo: NPS promedio ≥ 4.
      </div>

      {error && (
        <div className="text-sm text-destructive p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          Error: {error}
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Clientes</div>
          <div className="text-2xl font-semibold">{totalClients}</div>
          <div className="text-xs text-muted-foreground mt-1">{respondedClients.length} respondieron</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Con regla (0 si no resp.)</div>
          <div className={cn("text-2xl font-semibold", Number(avgWithRule) >= 4 ? 'text-emerald-600' : Number(avgWithRule) >= 3 ? 'text-amber-600' : 'text-red-600')}>
            {avgWithRule}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Solo respondientes</div>
          <div className={cn("text-2xl font-semibold", Number(avgOnlyResponded) >= 4 ? 'text-emerald-600' : Number(avgOnlyResponded) >= 3 ? 'text-amber-600' : 'text-red-600')}>
            {avgOnlyResponded}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">No respondieron</div>
          <div className={cn("text-2xl font-semibold", (totalClients - respondedClients.length) > 0 ? 'text-orange-600' : 'text-muted-foreground')}>
            {totalClients - respondedClients.length}
          </div>
        </div>
      </div>

      {/* NPS por Unidad de Negocio */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">NPS por Unidad de Negocio</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsByUnidad.map(stat => (
            <div key={stat.unidad} className="bg-card border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">{stat.unidad}</div>
                <Badge variant="outline" className="text-xs">
                  {stat.respondedCount}/{stat.totalClients}
                </Badge>
              </div>
              <div className="flex items-baseline gap-3">
                <div>
                  <div className={cn(
                    "text-xl font-bold",
                    Number(stat.avgOnlyResponded) >= 4 ? 'text-emerald-600' : 
                    Number(stat.avgOnlyResponded) >= 3 ? 'text-amber-600' : 
                    stat.avgOnlyResponded === '-' ? 'text-muted-foreground' : 'text-red-600'
                  )}>
                    {stat.avgOnlyResponded}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Respondientes</div>
                </div>
                <div className="text-muted-foreground">
                  <div className={cn(
                    "text-lg font-semibold",
                    Number(stat.avgWithRule) >= 4 ? 'text-emerald-600/60' : 
                    Number(stat.avgWithRule) >= 3 ? 'text-amber-600/60' : 
                    stat.avgWithRule === '-' ? 'text-muted-foreground' : 'text-red-600/60'
                  )}>
                    {stat.avgWithRule}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Con regla</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AC Blocks */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">NPS por Account Manager</h3>
        
        {acData.map(ac => (
          <div key={ac.id} className="bg-card border rounded-lg overflow-hidden">
            {/* AC Header */}
            <div className="flex items-center justify-between p-4 border-b bg-muted/30">
              <div>
                <div className="font-semibold">{ac.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ac.totalClients} clientes · {ac.totalClients - ac.respondedCount > 0 && `${ac.totalClients - ac.respondedCount} no respondieron`}
                </div>
              </div>
              <div className="flex gap-6 items-center">
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Con regla 0</div>
                  <Badge variant="outline" className={getNPSBadgeClass(Math.round(ac.avgWithRule))}>
                    {ac.avgWithRule.toFixed(2)}
                  </Badge>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Solo resp.</div>
                  <Badge variant="outline" className={getNPSBadgeClass(Math.round(ac.avgOnlyResponded))}>
                    {ac.respondedCount > 0 ? ac.avgOnlyResponded.toFixed(2) : '-'}
                  </Badge>
                </div>
              </div>
            </div>
            
            {/* Clients detail */}
            <div className="text-xs text-muted-foreground p-3 bg-muted/10 flex flex-wrap gap-x-3 gap-y-1">
              {ac.clients.map((client, idx) => (
                <span key={client.clientId}>
                  {client.clientName}
                  <span className={cn("font-semibold ml-0.5", client.responded ? getNPSColor(client.currentScore!) : 'text-muted-foreground')}>
                    ({client.responded ? client.currentScore : '0'})
                  </span>
                  {idx < ac.clients.length - 1 && ' ·'}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detail Table with Tabs */}
      <div className="border rounded-lg bg-card">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="border-b px-4 pt-3">
            <TabsList className="h-9">
              <TabsTrigger value="todos" className="text-xs">
                Todos los clientes
              </TabsTrigger>
              <TabsTrigger value="riesgo" className="text-xs gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                En riesgo (≤3)
              </TabsTrigger>
              <TabsTrigger value="noResp" className="text-xs gap-1.5">
                <BellOff className="h-3 w-3" />
                No respondieron
              </TabsTrigger>
              <TabsTrigger value="bajaron" className="text-xs gap-1.5">
                <TrendingDown className="h-3 w-3" />
                Bajaron
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="m-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Cliente</TableHead>
                    <TableHead className="text-left">Plan</TableHead>
                    <TableHead className="text-center">NPS Actual</TableHead>
                    <TableHead className="text-center">NPS Anterior</TableHead>
                    <TableHead className="text-center">Tendencia</TableHead>
                    <TableHead className="text-center">Historico (6 meses)</TableHead>
                    <TableHead className="text-center">Encuestas</TableHead>
                    <TableHead className="text-center">Ultima Encuesta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No hay datos para mostrar en esta vista.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((data) => (
                      <TableRow key={data.clientId}>
                        <TableCell className="font-medium">{data.clientName}</TableCell>
                        <TableCell>
                          {data.plan ? (
                            <Badge variant="outline" className="text-xs">
                              {data.plan}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn('text-xs font-semibold', getNPSBadgeClass(data.currentScore))}>
                            {data.currentScore ?? '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {data.previousScore !== null ? (
                            <Badge variant="outline" className={cn('text-xs font-semibold', getNPSBadgeClass(data.previousScore))}>
                              {data.previousScore}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <TrendIcon trend={data.trend} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-end gap-1 justify-center h-8">
                            {data.historicalScores.map((h, idx) => (
                              <div key={idx} className="flex flex-col items-center gap-0.5">
                                {h.score >= 0 ? (
                                  <div
                                    className={cn("w-4 rounded-t", NPS_COLORS[h.score]?.bg)}
                                    style={{ 
                                      height: `${Math.max((h.score / 5) * 24, 4)}px`
                                    }}
                                    title={`${h.mes}: ${h.score}`}
                                  />
                                ) : (
                                  <div 
                                    className="w-4 h-[2px] border-b border-dashed border-muted-foreground/30"
                                    title={`${h.mes}: Sin datos`}
                                  />
                                )}
                                <span className="text-[9px] text-muted-foreground">{h.mes}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {data.totalEncuestas}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {data.ultimaEncuesta 
                            ? new Date(data.ultimaEncuesta).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric' })
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

    </div>
  )
}
