import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: Request) {
  // Leer el body UNA sola vez
  const body = await req.json()
  const { resultado_id, cliente_id, nombre_cliente, delay_ms } = body

  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // Esperar el delay
  await new Promise(resolve => setTimeout(resolve, delay_ms || 35000))

  // Verificar en Google Sheets
  try {
    const { data: tokenData } = await supabase
      .from('plataformas_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('plataforma', 'google_sheets')
      .eq('activo', true)
      .single()

    if (!tokenData?.access_token) {
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

    const hace5min = Date.now() - 5 * 60 * 1000

    const encontrado = rows.some(row => {
      const fechaStr = row[1]
      const clienteNombre = row[4]
      if (!fechaStr || !clienteNombre) return false
      const [datePart, timePart] = fechaStr.trim().split(' ')
      if (!datePart || !timePart) return false
      const [day, month, year] = datePart.split('/')
      if (!day || !month || !year) return false
      const fechaUTC = new Date(`${year}-${month}-${day}T${timePart}:00-03:00`).getTime()
      const clienteMatch = clienteNombre.toLowerCase().includes(nombre_cliente.toLowerCase()) ||
                           nombre_cliente.toLowerCase().includes(clienteNombre.toLowerCase())
      return fechaUTC > hace5min && clienteMatch
    })

    await supabase.from('tester_resultados').update({
      estado: encontrado ? 'ok' : 'fallo',
      detalle: encontrado
        ? 'Ejecución del webhook registrada en el Sheet de logs'
        : 'Webhook respondió OK pero no se registró en el Sheet de logs en 5 minutos',
    }).eq('id', resultado_id)

  } catch (err) {
    await supabase.from('tester_resultados').update({
      estado: 'verificacion_manual',
      detalle: `Error verificando Sheet: ${err}`,
    }).eq('id', resultado_id)
  }

  return NextResponse.json({ ok: true })
}
