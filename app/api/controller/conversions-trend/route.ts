import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { fetchMetaTotals, fetchGoogleTotals } from '@/lib/ads-data'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const clienteId = request.nextUrl.searchParams.get('clienteId')
    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId required' }, { status: 400 })
    }

    const supabase = await createSupabaseClient()

    // Obtener credenciales del cliente
    const { data: cliente } = await supabase
      .from('clientes')
      .select('meta_account_id, google_ads_account_id, google_customer_id')
      .eq('id', clienteId)
      .single()

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const today = new Date()
    const conversionsBy7d = new Map<string, number>()
    const conversionsBy14d = new Map<string, number>()
    const conversionsBy30d = new Map<string, number>()

    // Obtener datos de los últimos 30 días
    for (let i = 0; i < 30; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]

      let totalConversions = 0

      // Meta: obtener leads del día
      if (cliente.meta_account_id) {
        try {
          const result = await fetchMetaTotals(cliente.meta_account_id, dateStr, dateStr)
          totalConversions += result.totals?.leads || 0
        } catch (err) {
          console.error('[v0] Error fetching Meta conversions:', err)
        }
      }

      // Google: obtener conversiones del día
      if (cliente.google_customer_id && cliente.google_ads_account_id) {
        try {
          const result = await fetchGoogleTotals(cliente.google_customer_id, dateStr, dateStr)
          totalConversions += result.totals?.conversions || 0
        } catch (err) {
          console.error('[v0] Error fetching Google conversions:', err)
        }
      }

      conversionsBy30d.set(dateStr, totalConversions)

      if (i < 14) {
        conversionsBy14d.set(dateStr, totalConversions)
      }

      if (i < 7) {
        conversionsBy7d.set(dateStr, totalConversions)
      }
    }

    // Convertir a arrays ordenados por fecha
    const sortedDates = (map: Map<string, number>) =>
      Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([fecha, conversiones]) => ({ fecha, conversiones }))

    const data7d = sortedDates(conversionsBy7d)
    const data14d = sortedDates(conversionsBy14d)
    const data30d = sortedDates(conversionsBy30d)

    // Calcular tendencias
    const calculateTrend = (data: Array<{ fecha: string; conversiones: number }>) => {
      if (data.length < 2) {
        return { tendencia: 'stable' as const, cambio: 0 }
      }

      const mid = Math.floor(data.length / 2)
      const firstHalf = data.slice(0, mid).reduce((sum, d) => sum + d.conversiones, 0)
      const secondHalf = data.slice(mid).reduce((sum, d) => sum + d.conversiones, 0)

      const firstAvg = firstHalf / mid
      const secondAvg = secondHalf / (data.length - mid)
      const cambio = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0

      return {
        tendencia: cambio > 2 ? ('up' as const) : cambio < -2 ? ('down' as const) : ('stable' as const),
        cambio: Math.round(cambio),
      }
    }

    const trend7d = calculateTrend(data7d)
    const trend14d = calculateTrend(data14d)
    const trend30d = calculateTrend(data30d)

    return NextResponse.json({
      data7d: {
        data: data7d,
        total: data7d.reduce((sum, d) => sum + d.conversiones, 0),
        promedio: Math.round(data7d.reduce((sum, d) => sum + d.conversiones, 0) / data7d.length),
        tendencia: trend7d.tendencia,
        cambio: trend7d.cambio,
      },
      data14d: {
        data: data14d,
        total: data14d.reduce((sum, d) => sum + d.conversiones, 0),
        promedio: Math.round(data14d.reduce((sum, d) => sum + d.conversiones, 0) / data14d.length),
        tendencia: trend14d.tendencia,
        cambio: trend14d.cambio,
      },
      data30d: {
        data: data30d,
        total: data30d.reduce((sum, d) => sum + d.conversiones, 0),
        promedio: Math.round(data30d.reduce((sum, d) => sum + d.conversiones, 0) / data30d.length),
        tendencia: trend30d.tendencia,
        cambio: trend30d.cambio,
      },
    })
  } catch (error) {
    console.error('[v0] Error in conversions-trend API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
