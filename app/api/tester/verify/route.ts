import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Background job: espera un delay y verifica si el lead de prueba llegó al CRM.
// maxDuration en 60s permite el delay de 30s + verificación (requiere plan Pro).
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { resultado_id, cliente_id, email_prueba, delay_ms } = await req.json() as {
      resultado_id: string
      cliente_id: string
      email_prueba?: string
      delay_ms?: number
    }

    if (!resultado_id || !cliente_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Esperar el delay antes de verificar
    await new Promise(resolve => setTimeout(resolve, delay_ms || 30000))

    const supabase = await createClient()

    const { data: cliente } = await supabase
      .from('clientes')
      .select('ghl_location_id, ghl_token, crm_tipo')
      .eq('id', cliente_id)
      .single()

    // CRM no configurado como GHL → marcar para verificación manual
    if (cliente?.crm_tipo !== 'ghl' || !cliente?.ghl_location_id || !cliente?.ghl_token) {
      await supabase
        .from('tester_resultados')
        .update({
          estado: 'verificacion_manual',
          detalle: 'Enviado correctamente - verificar manualmente en el CRM',
        })
        .eq('id', resultado_id)
      return NextResponse.json({ ok: true, estado: 'verificacion_manual' })
    }

    // Verificar en GHL
    let estado: 'ok' | 'fallo' = 'fallo'
    let detalle = 'Enviado pero el lead no llegó al CRM'

    try {
      const ghlRes = await fetch(
        `https://services.leadconnectorhq.com/contacts/?locationId=${cliente.ghl_location_id}&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${cliente.ghl_token}`,
            Version: '2021-07-28',
          },
        }
      )
      const ghlData = await ghlRes.json()
      const contactos = ghlData.contacts || []
      const hace2min = Date.now() - 2 * 60 * 1000

      const llego = contactos.some((c: any) => {
        const fecha = new Date(c.dateAdded).getTime()
        if (fecha <= hace2min) return false
        // Si se pasó un email de prueba, lo usamos para matchear; si no, basta con que sea reciente
        if (email_prueba) {
          return c.email === email_prueba || c.firstName === 'Test MDK Tester'
        }
        return true
      })

      estado = llego ? 'ok' : 'fallo'
      detalle = llego
        ? 'Lead de prueba recibido correctamente en el CRM'
        : 'Enviado pero el lead no llegó al CRM en el tiempo esperado'
    } catch (ghlError) {
      estado = 'fallo'
      detalle = 'Error al verificar en el CRM'
    }

    await supabase
      .from('tester_resultados')
      .update({ estado, detalle })
      .eq('id', resultado_id)

    return NextResponse.json({ ok: true, estado })
  } catch (error) {
    console.error('Error in tester verify:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
