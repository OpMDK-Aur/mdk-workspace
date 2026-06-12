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

    const verificarEnSheets = async (nombreCliente: string): Promise<{ estado: 'ok' | 'fallo' | 'verificacion_manual', detalle: string }> => {
      try {
        const { data: tokenData } = await supabase
          .from('plataformas_tokens')
          .select('access_token, refresh_token, token_expiry')
          .eq('plataforma', 'google_sheets')
          .eq('activo', true)
          .single()

        if (!tokenData?.access_token) {
          return { estado: 'verificacion_manual', detalle: 'Token de Google Sheets no configurado' }
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
        const sheetName = 'Log-ejecuciones'
        const range = `${sheetName}!A:G`

        const sheetsRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const sheetsData = await sheetsRes.json()
        const rows: string[][] = sheetsData.values || []

        console.log('[Sheets] rows count:', rows.length)
        console.log('[Sheets] últimas 3 filas:', JSON.stringify(rows.slice(-3)))
        console.log('[Sheets] buscando cliente:', nombreCliente)

        const hace5min = Date.now() - 5 * 60 * 1000
        console.log('[Sheets] buscando hace5min:', new Date(hace5min).toISOString())

        const encontrado = rows.some(row => {
          const fechaStr = row[1]
          const clienteNombre = row[4]
          
          if (!fechaStr || !clienteNombre) return false
          
          const [datePart, timePart] = fechaStr.split(' ')
          if (!datePart || !timePart) return false
          const [day, month, year] = datePart.split('/')
          const fechaUTC = new Date(`${year}-${month}-${day}T${timePart}:00`).getTime()
          
          const clienteMatch = clienteNombre.toLowerCase().includes(nombreCliente.toLowerCase()) ||
                               nombreCliente.toLowerCase().includes(clienteNombre.toLowerCase())
          
          return fechaUTC > hace5min && clienteMatch
        })

        return {
          estado: encontrado ? 'ok' : 'fallo',
          detalle: encontrado
            ? 'Ejecución del webhook registrada en el Sheet de logs'
            : 'Webhook respondió OK pero no se registró en el Sheet de logs en 3 minutos'
        }
      } catch (err) {
        return { estado: 'verificacion_manual', detalle: `Error verificando Sheet: ${err}` }
      }
    }

    const verificarEnOdoo = async (): Promise<{ estado: 'ok' | 'fallo' | 'verificacion_manual', detalle: string }> => {
      const { data: crmConexion } = await supabase
        .from('crm_conexiones')
        .select('*')
        .eq('cliente_id', cliente_id)
        .eq('tipo', 'odoo')
        .eq('activo', true)
        .single()

      console.log('[Odoo] crmConexion:', JSON.stringify(crmConexion))

      if (!crmConexion?.url || !crmConexion?.api_key || !crmConexion?.usuario || !crmConexion?.tabla_destino) {
        return { estado: 'verificacion_manual', detalle: 'Credenciales Odoo no configuradas - verificar manualmente' }
      }

      try {
        const authRes = await fetch(`${crmConexion.url}/web/session/authenticate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            id: 1,
            params: {
              db: crmConexion.tabla_destino,
              login: crmConexion.usuario,
              password: crmConexion.api_key,
            }
          })
        })
        const authData = await authRes.json()
        console.log('[Odoo] auth result uid:', authData.result?.uid, 'session:', authData.result?.session_id)
        const sessionId = authData.result?.session_id

        if (!sessionId) {
          return { estado: 'verificacion_manual', detalle: 'Error de autenticación en Odoo' }
        }

        // Filtrar por fecha — solo leads creados en los últimos 3 minutos
        const hace3min = new Date(Date.now() - 3 * 60 * 1000)
          .toISOString()
          .replace('T', ' ')
          .split('.')[0]

        console.log('[Odoo] buscando leads desde:', hace3min)

        const searchRes = await fetch(`${crmConexion.url}/web/dataset/call_kw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `session_id=${sessionId}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'call',
            id: 2,
            params: {
              model: 'crm.lead',
              method: 'search_read',
              args: [[
                '&',
                ['|',
                  ['email_from', '=', 'test-tester@madketing.io'],
                  ['contact_name', '=', 'Test MDK Tester']
                ],
                ['create_date', '>=', hace3min]
              ]],
              kwargs: {
                fields: ['id', 'name', 'email_from', 'contact_name', 'create_date'],
                limit: 5,
              }
            }
          })
        })
        const searchData = await searchRes.json()
        console.log('[Odoo] search result:', JSON.stringify(searchData.result))
        console.log('[Odoo] search error:', JSON.stringify(searchData.error))

        const leads = searchData.result || []
        const tieneResultados = leads.length > 0

        return {
          estado: tieneResultados ? 'ok' : 'fallo',
          detalle: tieneResultados
            ? 'Lead de prueba recibido correctamente en Odoo'
            : 'Webhook respondió OK pero el lead no llegó a Odoo en 30 segundos'
        }
      } catch (err) {
        console.error('[Odoo] error:', err)
        return { estado: 'verificacion_manual', detalle: `Error verificando Odoo: ${err}` }
      }
    }

    const verificarEnGHL = async (ghl_location_id: string, ghl_token: string): Promise<{ estado: 'ok' | 'fallo', detalle: string }> => {
      const ghlRes = await fetch(
        `https://services.leadconnectorhq.com/contacts/?locationId=${ghl_location_id}&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${ghl_token}`,
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
      return {
        estado: llegó ? 'ok' : 'fallo',
        detalle: llegó
          ? 'Lead de prueba recibido correctamente en GHL'
          : 'Webhook respondió OK pero el lead no llegó a GHL en 30 segundos'
      }
    }

    const verificarEnCRM = async (): Promise<{ estado: 'ok' | 'fallo' | 'verificacion_manual', detalle: string }> => {
      const { data: clienteData } = await supabase
        .from('clientes')
        .select('ghl_location_id, ghl_token, crm_tipo, nombre_del_negocio')
        .eq('id', cliente_id)
        .single()

      if (clienteData?.crm_tipo === 'ghl' && clienteData?.ghl_location_id && clienteData?.ghl_token) {
        return verificarEnGHL(clienteData.ghl_location_id, clienteData.ghl_token)
      }

      // Verificar si tiene conexión sheet en crm_conexiones
      const { data: sheetConexion } = await supabase
        .from('crm_conexiones')
        .select('sheet_id')
        .eq('cliente_id', cliente_id)
        .eq('tipo', 'sheet')
        .eq('activo', true)
        .single()

      if (sheetConexion?.sheet_id) {
        return verificarEnSheets(clienteData?.nombre_del_negocio || '')
      }

      if (clienteData?.crm_tipo === 'odoo' || clienteData?.crm_tipo === 'externo') {
        return verificarEnOdoo()
      }

      return { estado: 'verificacion_manual', detalle: 'CRM no configurado - verificar manualmente' }
    }

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

        const { estado, detalle } = await verificarEnCRM()

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
              await new Promise(resolve => setTimeout(resolve, 30000))
              const verificacion = await verificarEnCRM()
              estado = verificacion.estado
              detalle = verificacion.detalle
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
