import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TesterItem, TesterResultado } from '@/lib/types'

export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { cliente_id, items } = await req.json() as { cliente_id: string; items: TesterItem[] }

    if (!cliente_id || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get cliente info
    const { data: cliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', cliente_id)
      .single()

    if (!cliente) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const accessToken = process.env.META_ADS_ACCESS_TOKEN
    if (!accessToken) {
      return NextResponse.json({ error: 'META_ADS_ACCESS_TOKEN no configurado' }, { status: 500 })
    }

    const resultados: TesterResultado[] = []

    // Process each item
    for (const item of items) {
      if (item.tipo === 'meta_form') {
        // 1. Get page token for this client
        const accountsRes = await fetch(
          `https://graph.facebook.com/v19.0/me/accounts?limit=100&access_token=${accessToken}`
        )
        const accountsData = await accountsRes.json()
        const page = accountsData.data?.find((p: any) => p.id === cliente.meta_page_id)

        if (!page) {
          const resultado: TesterResultado = {
            id: crypto.randomUUID(),
            cliente_id,
            crm_tipo: cliente.crm_tipo,
            tipo: 'meta_form',
            nombre: item.nombre,
            form_id: item.form_id,
            landing_url: null,
            estado: 'fallo',
            detalle: 'Página Meta no encontrada - agrégala al Business Manager de MDK',
            modo: 'manual',
            ejecutado_por: user.id,
            tarea_generada_id: null,
            ejecutado_en: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
          resultados.push(resultado)
          await supabase.from('tester_resultados').insert(resultado)
          continue
        }

        const pageToken = page.access_token

        // 2. Send test lead to Meta
        const testLeadRes = await fetch(
          `https://graph.facebook.com/v19.0/${item.form_id}/test_leads?access_token=${pageToken}`,
          { method: 'POST' }
        )
        const testLeadData = await testLeadRes.json()

        if (testLeadData.error) {
          const resultado: TesterResultado = {
            id: crypto.randomUUID(),
            cliente_id,
            crm_tipo: cliente.crm_tipo,
            tipo: 'meta_form',
            nombre: item.nombre,
            form_id: item.form_id,
            landing_url: null,
            estado: 'fallo',
            detalle: `Error Meta: ${testLeadData.error.message}`,
            modo: 'manual',
            ejecutado_por: user.id,
            tarea_generada_id: null,
            ejecutado_en: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
          resultados.push(resultado)
          await supabase.from('tester_resultados').insert(resultado)
          continue
        }

        // 3. Wait 30 seconds for webhook to process
        await new Promise(resolve => setTimeout(resolve, 30000))

        // 4. Verify in GHL if configured
        let estado: 'ok' | 'fallo' | 'verificacion_manual' = 'verificacion_manual'
        let detalle = 'CRM no configurado - verificar manualmente'

        const { data: clienteData } = await supabase
          .from('clientes')
          .select('ghl_location_id, ghl_token, crm_tipo')
          .eq('id', cliente_id)
          .single()

        if (clienteData?.crm_tipo === 'ghl' && clienteData?.ghl_location_id && clienteData?.ghl_token) {
          try {
            const dosMinutosAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString()

            const ghlRes = await fetch(
              `https://services.leadconnectorhq.com/contacts/?locationId=${clienteData.ghl_location_id}&limit=10`,
              {
                headers: {
                  Authorization: `Bearer ${clienteData.ghl_token}`,
                  Version: '2021-07-28',
                }
              }
            )
            const ghlData = await ghlRes.json()
            const contactos = ghlData.contacts || []

            // Search for recent contact
            const leadLlegó = contactos.some((c: any) => {
              const fechaAgregado = new Date(c.dateAdded).getTime()
              const hace2min = Date.now() - 2 * 60 * 1000
              return fechaAgregado > hace2min
            })

            if (leadLlegó) {
              estado = 'ok'
              detalle = 'Lead recibido correctamente en GHL'
            } else {
              estado = 'fallo'
              detalle = 'Lead enviado a Meta pero no llegó a GHL en 30 segundos'
            }
          } catch (ghlError) {
            estado = 'fallo'
            detalle = 'Error verificando GHL'
          }
        }

        // 5. Save result
        const resultado: TesterResultado = {
          id: crypto.randomUUID(),
          cliente_id,
          crm_tipo: cliente.crm_tipo,
          tipo: 'meta_form',
          nombre: item.nombre,
          form_id: item.form_id,
          landing_url: null,
          estado,
          detalle,
          modo: 'manual',
          ejecutado_por: user.id,
          tarea_generada_id: null,
          ejecutado_en: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
        resultados.push(resultado)
        await supabase.from('tester_resultados').insert(resultado)
      } else if (item.tipo === 'landing') {
        // Test landing
        try {
          const response = await fetch(item.url || '', { method: 'HEAD' })
          const estado = response.ok ? 'ok' : 'fallo'

          const resultado: TesterResultado = {
            id: crypto.randomUUID(),
            cliente_id,
            crm_tipo: cliente.crm_tipo,
            tipo: 'landing',
            nombre: item.nombre,
            form_id: null,
            landing_url: item.url,
            estado,
            detalle: response.ok ? 'Landing accesible' : `Error HTTP ${response.status}`,
            modo: 'manual',
            ejecutado_por: user.id,
            tarea_generada_id: null,
            ejecutado_en: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
          resultados.push(resultado)

          // Insert into DB
          await supabase.from('tester_resultados').insert(resultado)
        } catch (error) {
          const resultado: TesterResultado = {
            id: crypto.randomUUID(),
            cliente_id,
            crm_tipo: cliente.crm_tipo,
            tipo: 'landing',
            nombre: item.nombre,
            form_id: null,
            landing_url: item.url,
            estado: 'fallo',
            detalle: 'No se pudo acceder a la landing',
            modo: 'manual',
            ejecutado_por: user.id,
            tarea_generada_id: null,
            ejecutado_en: new Date().toISOString(),
            created_at: new Date().toISOString()
          }
          resultados.push(resultado)

          // Insert into DB
          await supabase.from('tester_resultados').insert(resultado)
        }
      }
    }

    return NextResponse.json({ resultados })
  } catch (error) {
    console.error('Error in tester run:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
