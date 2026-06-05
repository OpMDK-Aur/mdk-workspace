'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, Users, Target, Clock } from 'lucide-react'

export default function PerformancePage() {
  const supabase = createClient()
  const [taskStats, setTaskStats] = useState({
    total: 0,
    completadas: 0,
    pendientes: 0,
    resueltas: 0,
    porcentajeCompletadas: 0,
  })
  const [tareasPorEstado, setTareasPorEstado] = useState<any[]>([])
  const [tareasPorSemana, setTareasPorSemana] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTaskStats()
  }, [])

  const fetchTaskStats = async () => {
    try {
      // Obtener todas las tareas
      const { data: tareas } = await supabase
        .from('tareas')
        .select('id, status, created_at, updated_at')
      
      if (!tareas) return

      // Calcular estadísticas por estado
      const stats = {
        total: tareas.length,
        completadas: tareas.filter(t => t.status === 'resuelto').length,
        pendientes: tareas.filter(t => t.status === 'pendiente').length,
        resueltas: tareas.filter(t => t.status === 'resuelto').length,
        porcentajeCompletadas: 0,
      }
      stats.porcentajeCompletadas = stats.total > 0 ? Math.round((stats.completadas / stats.total) * 100) : 0

      // Datos para pie chart por estado
      const estadoMap = {
        'pendiente': tareas.filter(t => t.status === 'pendiente').length,
        'resolviendo': tareas.filter(t => t.status === 'resolviendo').length,
        'resuelto': tareas.filter(t => t.status === 'resuelto').length,
      }
      const estadoData = Object.entries(estadoMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))

      // Datos para gráfico por semana
      const weekMap = new Map<string, number>()
      tareas.forEach(t => {
        const date = new Date(t.created_at)
        const week = `Sem ${Math.ceil((date.getDate() - date.getDay() + 1) / 7)}`
        weekMap.set(week, (weekMap.get(week) || 0) + 1)
      })
      const weekData = Array.from(weekMap).map(([week, count]) => ({
        week,
        tareas: count,
      }))

      setTaskStats(stats)
      setTareasPorEstado(estadoData)
      setTareasPorSemana(weekData)
    } catch (error) {
      console.error('[v0] Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const COLORS = ['#ef4444', '#f59e0b', '#10b981']

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Cargando datos...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        <p className="text-muted-foreground">Métricas y análisis de tu equipo</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tareas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.total}</div>
            <p className="text-xs text-muted-foreground">Todas las tareas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completadas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.completadas}</div>
            <p className="text-xs text-muted-foreground">{taskStats.porcentajeCompletadas}% del total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.pendientes}</div>
            <p className="text-xs text-muted-foreground">En espera</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Éxito</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.porcentajeCompletadas}%</div>
            <p className="text-xs text-muted-foreground">De completación</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="estado" className="space-y-4">
        <TabsList>
          <TabsTrigger value="estado">Por Estado</TabsTrigger>
          <TabsTrigger value="semana">Por Semana</TabsTrigger>
        </TabsList>

        <TabsContent value="estado" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distribución de Tareas por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tareasPorEstado}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {tareasPorEstado.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="semana" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tareas Creadas por Semana</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tareasPorSemana}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="tareas" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
