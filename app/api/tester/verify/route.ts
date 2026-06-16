import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json()
  const { resultado_id, cliente_id, nombre_cliente, delay_ms } = body

  console.log('[Verify] iniciando - resultado_id:', resultado_id, 'cliente:', nombre_cliente)

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    console.log('[Verify] sin auth header, rechazando')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  await new Promise(resolve => setTimeout(resolve, delay_ms || 35000))

  console.log('[Verify] delay completado, verificando Sheet')

  try {
    const { data: tokenData } = await supabase
      .from('plataformas_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('plataforma', 'google_sheets')
      .eq('activo', true)
      .single()

    if (!tokenData?.access_token) {
      console.log('[Verify] sin token de Google Sheets')
      await supabase.from('tester_resultados').update({
        estado: 'verificacion_manual',
        detalle: 'Token de Google Sheets no configurado - verificar manualmente',
      }).eq('id', resultado_id)
      return NextResponse.json({ ok: true })
    }

    let accessToken = tokenData.access_token
    const expiryTime = new Date(tokenData.token_expiry).getTime()
    if (expiryTime < Date.now() + 5 * 60 * 1000) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      })
      const refreshData = await refreshRes.json()
      if (refreshData.access_token) {
        accessToken = refreshData.access_token
        await supabase.from('plataformas_tokens').update({
          access_token: refreshData.access_token,
          token_expiry: new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString(),
        }).eq('plataforma', 'google_sheets')
      }
    }

    const spreadsheetId = '1b_E8wz5I-dW4u-vuHWwf7TQ70s4s8trt0PpvBEDEi7M'
    const range = 'Log-ejecuciones!A:G'
    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const sheetsData = await sheetsRes.json()
    const rows: string[][] = sheetsData.values || []

    console.log('[Verify] total filas en Sheet:', rows.length)
    console.log('[Verify] buscando cliente:', nombre_cliente)

    const hace10min = Date.now() - 10 * 60 * 1000
    console.log('[Verify] ventana de tiempo desde:', new Date(hace10min).toISOString())

    const encontrado = rows.some(row => {
      try {
        const fechaStr = row[1]
        const clienteNombre = row[4]
        if (!fechaStr || !clienteNombre) return false
        const [datePart, timePart] = fechaStr.trim().split(' ')
        if (!datePart || !timePart) return false
        const parts = datePart.split('/')
        if (parts.length !== 3) return false
        const [day, month, year] = parts
        if (!day || !month || !year || year.length !== 4) return false
        const fechaUTC = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}:00-03:00`).getTime()
        if (isNaN(fechaUTC)) return false
        const clienteMatch = clienteNombre.toLowerCase().includes(nombre_cliente.toLowerCase()) ||
                             nombre_cliente.toLowerCase().includes(clienteNombre.toLowerCase())
        if (clienteMatch) {
          console.log('[Verify] match:', fechaStr, clienteNombre, 'reciente:', fechaUTC > hace10min)
        }
        return fechaUTC > hace10min && clienteMatch
      } catch {
        return false
      }
    })

    console.log('[Verify] encontrado:', encontrado)

    if (encontrado) {
      await supabase.from('tester_resultados').update({
        estado: 'ok',
        detalle: 'Ejecución del webhook registrada en el Sheet de logs',
      }).eq('id', resultado_id)

      // Marcar tarea de hito como realizado si existe
      const { data: tareaHito } = await supabase
        .from('tareas')
        .select('id')
        .contains('cliente_ids', [cliente_id])
        .ilike('titulo', '%Testing de Integración%')
        .in('estado', ['pendiente', 'resolviendo'])
        .single()

      if (tareaHito) {
        console.log('[Verify] marcando tarea como realizado:', tareaHito.id)
        await supabase
          .from('tareas')
          .update({ estado: 'realizado' })
          .eq('id', tareaHito.id)
      }
    } else {
      await supabase.from('tester_resultados').update({
        estado: 'fallo',
        detalle: 'Webhook respondió OK pero no se registró en el Sheet de logs en 10 minutos',
      }).eq('id', resultado_id)
    }

  } catch (err) {
    console.error('[Verify] error:', err)
    await supabase.from('tester_resultados').update({
      estado: 'verificacion_manual',
      detalle: `Error verificando Sheet: ${err}`,
    }).eq('id', resultado_id)
  }

  return NextResponse.json({ ok: true })
}