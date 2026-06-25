'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUp, ArrowDown } from 'lucide-react'

interface ConversionData {
  fecha: string
  conversiones: number
}

interface TrendStats {
  data: ConversionData[]
  total: number
  promedio: number
  tendencia: 'up' | 'down' | 'stable'
  cambio: number
}

interface ConversionsTrendProps {
  clienteId?: string
}

export function ConversionsTrend({ clienteId }: ConversionsTrendProps) {
  const [trends, setTrends] = useState<{
    data7d: TrendStats
    data14d: TrendStats
    data30d: TrendStats
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        if (!clienteId) {
          setLoading(false)
          return
        }

        const res = await fetch(`/api/controller/conversions-trend?clienteId=${clienteId}`)
        if (!res.ok) throw new Error('Failed to fetch data')

        const data = await res.json()
        setTrends(data)
      } catch (error) {
        console.error('[v0] Error fetching conversions trend:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [clienteId])

  if (!clienteId) {
    return (
      <Card className="bg-[#0a0a0a] border-white/5">
        <CardHeader>
          <CardTitle>Análisis de Conversiones</CardTitle>
          <CardDescription>Selecciona un cliente para ver el análisis</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="bg-[#0a0a0a] border-white/5">
        <CardHeader>
          <CardTitle>Análisis de Conversiones</CardTitle>
          <CardDescription>Cargando datos...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!trends) {
    return (
      <Card className="bg-[#0a0a0a] border-white/5">
        <CardHeader>
          <CardTitle>Análisis de Conversiones</CardTitle>
          <CardDescription>No hay datos disponibles</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const renderTrendCard = (period: 'data7d' | 'data14d' | 'data30d', label: string) => {
    const stat = trends[period]

    return (
      <div key={period} className="bg-[#0f0f0f] border border-white/5 rounded-lg p-4">
        <p className="text-xs text-gray-400 mb-3">{label}</p>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stat.total}</p>
              <p className="text-xs text-gray-500 mt-1">Promedio: {stat.promedio}/día</p>
            </div>
            <div className="flex items-center gap-1">
              {stat.tendencia === 'up' && (
                <div className="flex items-center gap-1 text-green-400">
                  <ArrowUp className="h-4 w-4" />
                  <span className="text-sm font-semibold">+{stat.cambio}%</span>
                </div>
              )}
              {stat.tendencia === 'down' && (
                <div className="flex items-center gap-1 text-red-400">
                  <ArrowDown className="h-4 w-4" />
                  <span className="text-sm font-semibold">{stat.cambio}%</span>
                </div>
              )}
              {stat.tendencia === 'stable' && (
                <div className="text-gray-500 text-sm font-semibold">Estable</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderChart = (period: 'data7d' | 'data14d' | 'data30d', label: string) => {
    const stat = trends[period]

    return (
      <div key={`chart-${period}`} className="bg-[#0f0f0f] border border-white/5 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-300 mb-4">{label}</p>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={stat.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" />
            <XAxis dataKey="fecha" stroke="#ffffff4d" style={{ fontSize: '11px' }} tick={{ fill: '#ffffff66' }} />
            <YAxis stroke="#ffffff4d" style={{ fontSize: '11px' }} tick={{ fill: '#ffffff66' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #ffffff1a', borderRadius: '6px' }}
              labelStyle={{ color: '#ffffff' }}
              formatter={(value) => [`${value} conversiones`, 'Total']}
            />
            <Line
              type="monotone"
              dataKey="conversiones"
              stroke="#7F77DD"
              dot={{ fill: '#7F77DD', r: 3 }}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <Card className="bg-[#0a0a0a] border-white/5">
      <CardHeader>
        <CardTitle>Análisis de Conversiones</CardTitle>
        <CardDescription>Curva de funcionamiento en últimos 7, 14 y 30 días</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Tarjetas de resumen */}
        <div className="grid grid-cols-3 gap-4">
          {renderTrendCard('data7d', 'Últimos 7 días')}
          {renderTrendCard('data14d', 'Últimos 14 días')}
          {renderTrendCard('data30d', 'Últimos 30 días')}
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-3 gap-4">
          {renderChart('data7d', 'Últimos 7 días')}
          {renderChart('data14d', 'Últimos 14 días')}
          {renderChart('data30d', 'Últimos 30 días')}
        </div>
      </CardContent>
    </Card>
  )
}
