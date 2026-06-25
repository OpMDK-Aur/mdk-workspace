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
    today.setHours(0, 0, 0, 0)
    
    // Calcular fechas para cada período
    const today30 = new Date(today)
    const start30 = new Date(today)
    start30.setDate(start30.getDate() - 29)
    const dateStr30Start = start30.toISOString().split('T')[0]
    const dateStr30End = today.toISOString().split('T')[0]

    const start14 = new Date(today)
    start14.setDate(start14.getDate() - 13)
    const dateStr14Start = start14.toISOString().split('T')[0]
    const dateStr14End = today.toISOString().split('T')[0]

    const start7 = new Date(today)
    start7.setDate(start7.getDate() - 6)
    const dateStr7Start = start7.toISOString().split('T')[0]
    const dateStr7End = today.toISOString().split('T')[0]

    // Obtener datos agregados para cada período
    let total30d = 0, total14d = 0, total7d = 0

    // Meta
    if (cliente.meta_account_id) {
      try {
        const result30 = await fetchMetaTotals(cliente.meta_account_id, dateStr30Start, dateStr30End)
        total30d += result30.totals?.leads || 0
        
        const result14 = await fetchMetaTotals(cliente.meta_account_id, dateStr14Start, dateStr14End)
        total14d += result14.totals?.leads || 0
        
        const result7 = await fetchMetaTotals(cliente.meta_account_id, dateStr7Start, dateStr7End)
        total7d += result7.totals?.leads || 0
      } catch (err) {
        console.error('[v0] Error fetching Meta conversions:', err)
      }
    }

    // Google
    if (cliente.google_customer_id && cliente.google_ads_account_id) {
      try {
        const result30 = await fetchGoogleTotals(cliente.google_customer_id, dateStr30Start, dateStr30End)
        total30d += result30.totals?.conversions || 0
        
        const result14 = await fetchGoogleTotals(cliente.google_customer_id, dateStr14Start, dateStr14End)
        total14d += result14.totals?.conversions || 0
        
        const result7 = await fetchGoogleTotals(cliente.google_customer_id, dateStr7Start, dateStr7End)
        total7d += result7.totals?.conversions || 0
      } catch (err) {
        console.error('[v0] Error fetching Google conversions:', err)
      }
    }

    // Generar datos diarios simulados basados en los totales
    const generateDailyData = (start: Date, days: number, total: number) => {
      const data = []
      const avgPerDay = Math.round(total / days)
      for (let i = 0; i < days; i++) {
        const date = new Date(start)
        date.setDate(date.getDate() + i)
        const dateStr = date.toISOString().split('T')[0]
        data.push({
          fecha: dateStr,
          conversiones: avgPerDay,
        })
      }
      return data
    }

    const data7d = generateDailyData(start7, 7, total7d)
    const data14d = generateDailyData(start14, 14, total14d)
    const data30d = generateDailyData(start30, 30, total30d)

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
