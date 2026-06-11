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

    console.log('[Tester Run] cliente_id:', cliente_id)
    console.log('[Tester Run] items:', JSON.stringify(items))

    if (!cliente_id || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    for (const item of items) {
      if (item.tipo === 'meta_form') {
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

        await new Promise(resolve => setTimeout(resolve, 30000))

        let estado: 'ok' | 'fallo' | 'verificacion_manual' = 'verificacion_manual'
        let detalle = 'CRM no configurado - verificar manualmente'

        const { data: clienteData } = await supabase
          .from('clientes')
          .select('ghl_location_id, ghl_token, crm_tipo')
          .eq('id', cliente_id)
          .single()

        if (clienteData?.crm_tipo === 'ghl' && clienteData?.ghl_location_id && clienteData?.ghl_token) {
          try {
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
            const leadLlegó = contactos.some((c: any) => {
              const fechaAgregado = new Date(c.dateAdded).getTime()
              const hace2min = Date.now() - 2 * 60 * 1000
              return fechaAgregado > hace2min
            })
            estado = leadLlegó ? 'ok' : 'fallo'
            detalle = leadLlegó
              ? 'Lead recibido correctamente en GHL'
              : 'Lead enviado a Meta pero no llegó a GHL en 30 segundos'
          } catch {
            estado = 'fallo'
            detalle = 'Error verificando GHL'
          }
        }

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
        const integracion = item.integracion || null
        const userId = user.id
        let estado: 'ok' | 'fallo' | 'verificacion_manual' = 'fallo'
        let detalle = ''

        if (integracion === 'whatsapp_button') {
          try {
            const pageRes = await fetch(item.url || '', { method: 'GET' })
            const html = await pageRes.text()
            const tieneWaLink = html.includes('wa.me') || html.includes('api.whatsapp.com')
            estado = tieneWaLink ? 'ok' : 'fallo'
            detalle = tieneWaLink
              ? 'Botón de WhatsApp encontrado en la página'
              : 'No se encontró botón de WhatsApp en la página'
          } catch (err) {
            estado = 'fallo'
            detalle = `Error al acceder a la página: ${err}`
          }

        } else if (integracion === 'whatsapp_form') {
          try {
            const pageRes = await fetch(item.url || '', { method: 'GET' })
            const html = await pageRes.text()
            const tieneForm = html.includes('<form') || html.includes('wpcf7') || html.includes('wpforms')
            const tieneWa = html.includes('wa.me') || html.includes(item.whatsapp_numero || '')
            estado = tieneForm && tieneWa ? 'ok' : 'fallo'
            detalle = !tieneForm
              ? 'No se encontró formulario en la página'
              : !tieneWa
              ? 'Formulario encontrado pero sin número de WhatsApp'
              : 'Formulario con WhatsApp verificado'
          } catch (err) {
            estado = 'fallo'
            detalle = `Error al acceder a la página: ${err}`
          }

        } else if (integracion === 'webhook' && item.webhook_url) {
          try {
            const webhookRes = await fetch(item.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nombre: 'Test MDK Tester',
                email: 'test-tester@madketing.io',
                telefono: '+5491100000000',
                mensaje: 'Test automático del sistema MDK - ignorar',
                _tester: true,
                timestamp: new Date().toISOString(),
              }),
            })

            if (!webhookRes.ok) {
              estado = 'fallo'
              detalle = `Webhook respondió con status ${webhookRes.status}`
            } else {
              await new Promise(resolve => setTimeout(resolve, 20000))

              const { data: clienteData } = await supabase
                .from('clientes')
                .select('ghl_location_id, ghl_token, crm_tipo')
                .eq('id', cliente_id)
                .single()

              estado = 'verificacion_manual'
              detalle = 'Webhook respondió OK - verificar manualmente en CRM'

              if (clienteData?.crm_tipo === 'ghl' && clienteData?.ghl_location_id && clienteData?.ghl_token) {
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
                const hace2min = Date.now() - 2 * 60 * 1000
                const llegó = contactos.some((c: any) => {
                  const fecha = new Date(c.dateAdded).getTime()
                  return fecha > hace2min &&
                    (c.email === 'test-tester@madketing.io' || c.firstName === 'Test MDK Tester')
                })
                estado = llegó ? 'ok' : 'fallo'
                detalle = llegó
                  ? 'Lead de prueba recibido correctamente en GHL'
                  : 'Webhook respondió OK pero el lead no llegó a GHL en 20 segundos'
              }
            }
          } catch (err) {
            estado = 'fallo'
            detalle = `Error al llamar al webhook: ${err}`
          }

        } else {
          try {
            const pageRes = await fetch(item.url || '', { method: 'HEAD' })
            estado = pageRes.ok ? 'verificacion_manual' : 'fallo'
            detalle = pageRes.ok
              ? 'Página activa - configurar integración para test completo'
              : `Página no responde (status ${pageRes.status})`
          } catch (err) {
            estado = 'fallo'
            detalle = `Error al acceder a la página: ${err}`
          }
        }

        const resultado: TesterResultado = {
          id: crypto.randomUUID(),
          cliente_id,
          crm_tipo: cliente.crm_tipo,
          tipo: 'landing',
          nombre: item.nombre,
          form_id: null,
          landing_url: item.url || null,
          estado,
          detalle,
          modo: 'manual',
          ejecutado_por: userId,
          tarea_generada_id: null,
          ejecutado_en: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
        resultados.push(resultado)
        await supabase.from('tester_resultados').insert(resultado)
      }
    }

    return NextResponse.json({ resultados })
  } catch (error) {
    console.error('Error in tester run:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}