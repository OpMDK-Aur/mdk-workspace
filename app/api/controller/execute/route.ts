import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Función para obtener datos reales de Meta y Google Ads
async function obtenerDatosReales(
  clienteId: string, 
  plataforma: string, 
  periodo: string,
  supabase: any
) {
  const datosActuales: any = {}
  const datosPrevios: any = {}
  
  try {
    // Obtener cuentas del cliente
    const { data: cuentas } = await supabase
      .from('cuentas_publicitarias')
      .select('id_cuenta, plataforma')
      .eq('cliente_id', clienteId)
    
    if (!cuentas || cuentas.length === 0) {
      console.log('[controller/execute] No se encontraron cuentas publicitarias')
      return { datosActuales, datosPrevios, periodo }
    }
    
    // Calcular fechas según período
    const hoy = new Date()
    let fechaActualIni: string, fechaActualFin: string, fechaPreviaIni: string, fechaPreviaFin: string
    
    if (periodo === 'hoy') {
      const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000)
      const antesDeAyer = new Date(ayer.getTime() - 24 * 60 * 60 * 1000)
      fechaActualIni = hoy.toISOString().split('T')[0]
      fechaActualFin = hoy.toISOString().split('T')[0]
      fechaPreviaIni = ayer.toISOString().split('T')[0]
      fechaPreviaFin = ayer.toISOString().split('T')[0]
    } else if (periodo === '7dias') {
      const hace7 = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
      const hace14 = new Date(hoy.getTime() - 14 * 24 * 60 * 60 * 1000)
      const hace7Menos1 = new Date(hace7.getTime() - 24 * 60 * 60 * 1000)
      fechaActualIni = hace7.toISOString().split('T')[0]
      fechaActualFin = hoy.toISOString().split('T')[0]
      fechaPreviaIni = hace14.toISOString().split('T')[0]
      fechaPreviaFin = hace7Menos1.toISOString().split('T')[0]
    } else {
      // 30dias
      const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000)
      const hace60 = new Date(hoy.getTime() - 60 * 24 * 60 * 60 * 1000)
      const hace30Menos1 = new Date(hace30.getTime() - 24 * 60 * 60 * 1000)
      fechaActualIni = hace30.toISOString().split('T')[0]
      fechaActualFin = hoy.toISOString().split('T')[0]
      fechaPreviaIni = hace60.toISOString().split('T')[0]
      fechaPreviaFin = hace30Menos1.toISOString().split('T')[0]
    }
    
    // Obtener datos de Meta
    const cuentaMeta = cuentas.find((c: any) => c.plataforma === 'meta')
    if (cuentaMeta && (plataforma === 'meta' || plataforma === 'ambas')) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        const [respActual, respPrevio] = await Promise.all([
          fetch(`${baseUrl}/api/ads/meta?account_id=${cuentaMeta.id_cuenta}&start_date=${fechaActualIni}&end_date=${fechaActualFin}`),
          fetch(`${baseUrl}/api/ads/meta?account_id=${cuentaMeta.id_cuenta}&start_date=${fechaPreviaIni}&end_date=${fechaPreviaFin}`),
        ])
        
        if (respActual.ok) {
          const data = await respActual.json()
          // Extraer totals que contiene: impressions, clicks, spend, leads, ctr, cpc, cpl
          datosActuales.meta = data.totals || data
        }
        if (respPrevio.ok) {
          const data = await respPrevio.json()
          datosPrevios.meta = data.totals || data
        }
      } catch (err) {
        console.error('[controller/execute] Error obteniendo datos Meta:', err)
      }
    }
    
    // Obtener datos de Google
    const cuentaGoogle = cuentas.find((c: any) => c.plataforma === 'google')
    if (cuentaGoogle && (plataforma === 'google' || plataforma === 'ambas')) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        const [respActual, respPrevio] = await Promise.all([
          fetch(`${baseUrl}/api/google-ads/conversions?customer_id=${cuentaGoogle.id_cuenta}&start_date=${fechaActualIni}&end_date=${fechaActualFin}`),
          fetch(`${baseUrl}/api/google-ads/conversions?customer_id=${cuentaGoogle.id_cuenta}&start_date=${fechaPreviaIni}&end_date=${fechaPreviaFin}`),
        ])
        
        if (respActual.ok) {
          const data = await respActual.json()
          datosActuales.google = data.totals || data
        }
        if (respPrevio.ok) {
          const data = await respPrevio.json()
          datosPrevios.google = data.totals || data
        }
      } catch (err) {
        console.error('[controller/execute] Error obteniendo datos Google:', err)
      }
    }
  } catch (error) {
    console.error('[controller/execute] Error obteniendo datos reales:', error)
  }
  
  return { datosActuales, datosPrevios, periodo }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { 
      clienteId, 
      alertaSubtipo,
      accion,
      plataforma,
      periodo,
    }: { 
      clienteId: string
      alertaSubtipo: string
      accion?: string
      plataforma?: string
      periodo?: string
    } = body

    if (!clienteId || !alertaSubtipo) {
      return NextResponse.json({ error: 'clienteId y alertaSubtipo requeridos' }, { status: 400 })
    }

    const supabase = await createClient()

    // Obtener usuario actual
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Usuario no autenticado' }, { status: 401 })
    }

    // Obtener datos reales de las APIs
    const datosReales = await obtenerDatosReales(clienteId, plataforma || 'ambas', periodo || '7dias', supabase)

    // Obtener datos del cliente
    const { data: cliente } = await supabase
      .from('clientes')
      .select('id, nombre_del_negocio, account_manager_ids')
      .eq('id', clienteId)
      .maybeSingle()

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Obtener la alerta si existe en BD
    const { data: alerta } = await supabase
      .from('controller_alertas')
      .select('id, accion, activa, plataforma, configuracion')
      .eq('cliente_id', clienteId)
      .eq('subtipo', alertaSubtipo)
      .maybeSingle()

    // Generar descripción con datos reales de las APIs
    const generarDatosDetectados = (subtipo: string, platformaActual: string, datos: any) => {
      const esMeta = platformaActual?.toLowerCase() === 'meta'
      const esGoogle = platformaActual?.toLowerCase() === 'google'
      
      // Extraer datos reales
      const metaActual = datos.datosActuales?.meta || {}
      const metaPrevio = datos.datosPrevios?.meta || {}
      const googleActual = datos.datosActuales?.google || {}
      const googlePrevio = datos.datosPrevios?.google || {}
      
      // Función para calcular porcentaje de cambio
      const calcularCambio = (actual: number, anterior: number) => {
        if (anterior === 0) return 0
        return (((actual - anterior) / anterior) * 100).toFixed(1)
      }
      
      if (esMeta && (metaActual.leads !== undefined || Object.keys(metaActual).length > 0)) {
        // Datos reales de Meta - mapear campos correctos
        const leadsActuales = metaActual.leads || 0
        const leadsPrevios = metaPrevio.leads || leadsActuales
        const cambioLeads = calcularCambio(leadsActuales, leadsPrevios)
        const cplActual = metaActual.cpl || 0
        const cplPrevio = metaPrevio.cpl || cplActual
        const cambioCPI = calcularCambio(cplActual, cplPrevio)
        
        if (subtipo === 'caida_conversiones_porcentual') {
          return `Se detectó un cambio del ${cambioLeads}% en leads en el período analizado en Meta. Leads: ${leadsPrevios} → ${leadsActuales}. CPL: $${cplPrevio} → $${cplActual}.`
        } else if (subtipo === 'cpl_aumento_porcentual') {
          return `CPL (Costo por Lead) cambió un ${cambioCPI}% en Meta. CPL anterior: $${cplPrevio} → CPL actual: $${cplActual}. Leads completados: ${leadsActuales}.`
        } else if (subtipo === 'presupuesto_agotado_diario') {
          const presupuesto = metaActual.spend || 0
          return `Presupuesto diario agotado en Meta. Gastado: $${presupuesto.toFixed(2)}. CPL: $${cplActual.toFixed(2)}. Leads: ${leadsActuales}.`
        } else if (subtipo === 'tasa_conversion_baja') {
          const impressions = metaActual.impressions || 1
          const tasa = ((leadsActuales / impressions) * 100).toFixed(2)
          return `Tasa de conversión de leads crítica detectada: ${tasa}% en Meta. Impresiones: ${impressions} | Leads: ${leadsActuales}.`
        }
      } else if (esGoogle && (googleActual.conversions !== undefined || googleActual.leads !== undefined || Object.keys(googleActual).length > 0)) {
        // Datos reales de Google Ads - conversions o leads
        const conversionesActuales = googleActual.conversions || googleActual.leads || 0
        const conversionesPrevias = googlePrevio.conversions || googlePrevio.leads || conversionesActuales
        const cambioConversiones = calcularCambio(conversionesActuales, conversionesPrevias)
        const cpcActual = googleActual.cpc || 0
        const cpcPrevio = googlePrevio.cpc || cpcActual
        
        if (subtipo === 'caida_conversiones_porcentual') {
          return `Se detectó un cambio del ${cambioConversiones}% en conversiones en el período analizado en Google Ads. Conversiones: ${conversionesPrevias} → ${conversionesActuales}. CPC: $${cpcPrevio.toFixed(2)} → $${cpcActual.toFixed(2)}.`
        } else if (subtipo === 'cpl_aumento_porcentual') {
          const cambioCPC = calcularCambio(cpcActual, cpcPrevio)
          return `CPC (Costo por Clic) cambió un ${cambioCPC}% en Google Ads. CPC anterior: $${cpcPrevio.toFixed(2)} → CPC actual: $${cpcActual.toFixed(2)}. Conversiones: ${conversionesActuales}.`
        } else if (subtipo === 'presupuesto_agotado_diario') {
          const spend = googleActual.spend || 0
          return `Presupuesto diario agotado en Google Ads. Gastado: $${spend.toFixed(2)}. Clics: ${googleActual.clicks || 0}.`
        } else if (subtipo === 'tasa_conversion_baja') {
          const clicks = googleActual.clicks || 1
          const tasa = ((conversionesActuales / clicks) * 100).toFixed(2)
          return `Tasa de conversión crítica detectada: ${tasa}% en Google Ads. Clics: ${clicks} | Conversiones: ${conversionesActuales}. CPC: $${cpcActual.toFixed(2)}.`
        }
      } else {
        // Fallback si no hay datos reales
        return `Se disparó la alerta ${subtipo} en ${platformaActual}. Período analizado: ${datos.periodo}.`
      }
      
      return `Se disparó la alerta ${subtipo} en ${platformaActual}.`
    }

    // Construir descripción detallada de la alerta
    let descripcionDetallada = `Alerta automática disparada por el Controller.\n\n`
    descripcionDetallada += `Tipo de alerta: ${alertaSubtipo}\n`
    descripcionDetallada += `Plataforma: ${plataforma || alerta?.plataforma || 'ambas'}\n`
    descripcionDetallada += `Fecha: ${new Date().toLocaleString('es-AR')}\n`
    
    // Agregar QUÉ SE DETECTÓ
    descripcionDetallada += `\n━━━ QUÉ SE DETECTÓ ━━━\n`
    descripcionDetallada += generarDatosDetectados(alertaSubtipo, plataforma || alerta?.plataforma || 'ambas', datosReales) + `\n`
    
    if (alerta) {
      descripcionDetallada += `\n━━━ CONFIGURACIÓN ━━━\n`
      
      // Agregar configuración si existe
      if (alerta.configuracion) {
        const config = alerta.configuracion as any
        if (config.campos && Object.keys(config.campos).length > 0) {
          descripcionDetallada += `\nCampos configurados:\n`
          Object.entries(config.campos).forEach(([campo, valor]) => {
            if (valor) {
              descripcionDetallada += `• ${campo}: ${valor}\n`
            }
          })
        }
        
        if (config.variantes && Array.isArray(config.variantes) && config.variantes.length > 0) {
          descripcionDetallada += `\nVariantes configuradas:\n`
          config.variantes.forEach((v: any, idx: number) => {
            descripcionDetallada += `• Variante ${idx + 1}: ${v.porcentaje}% en ${v.dias} días\n`
          })
        }
      }
    }

    // Crear resultado
    const resultado = {
      alerta_id: alerta?.id || `test-${alertaSubtipo}`,
      subtipo: alertaSubtipo,
      estado: 'ejecutada',
      timestamp: new Date().toISOString(),
      acciones: [] as string[],
    }

    // Determinar qué acciones ejecutar (priorizar frontend > BD > default)
    const accionFinal = accion || alerta?.accion || 'ambas'
    const account_managers = cliente?.account_manager_ids || []

    // ACCIÓN 1: Crear tarea si aplica
    if (accionFinal === 'tarea' || accionFinal === 'ambas') {
      try {
        const { data: tarea } = await supabase
          .from('tareas')
          .insert({
            titulo: `[Alerta Controller] ${alertaSubtipo} — ${cliente.nombre_del_negocio}`,
            descripcion: descripcionDetallada,
            cliente_ids: [clienteId],
            asignado_a: user.id,
            asignados_a: [user.id, ...account_managers],
            prioridad: 'media',
            estado: 'pendiente',
            creado_por: user.id,
          })
          .select()
          .maybeSingle()

        if (tarea) {
          resultado.acciones.push(`✓ Tarea creada (ID: ${tarea.id})`)
        } else {
          resultado.acciones.push('✗ Error al crear tarea')
        }
      } catch (error) {
        console.error('Error creating task:', error)
        resultado.acciones.push('✗ Error al crear tarea')
      }
    }

    // ACCIÓN 2: Enviar notificación si aplica
    if (accionFinal === 'notificacion' || accionFinal === 'ambas') {
      try {
        // Obtener IDs de colaboradores para notificar
        const notifyUsers = [user.id, ...account_managers]

        // Construir resumen breve para notificación
        let resumenNotificacion = `Se disparó una alerta del Controller para ${cliente.nombre_del_negocio}.\n`
        if (alerta) {
          resumenNotificacion += `Plataforma: ${alerta.plataforma || 'ambas'}`
        }

        const { error: notifError } = await supabase
          .from('notificaciones')
          .insert(
            notifyUsers.map((colaboradorId) => ({
              colaborador_id: colaboradorId,
              tipo: 'alerta_controller',
              titulo: `Alerta Controller: ${alertaSubtipo}`,
              descripcion: descripcionDetallada,
              referencia_id: alerta?.id || clienteId,
              referencia_tipo: 'alerta_controller',
              cliente_id: clienteId,
              leida: false,
            }))
          )

        if (!notifError) {
          resultado.acciones.push(`✓ ${notifyUsers.length} notificaciones enviadas`)
        } else {
          resultado.acciones.push('✗ Error al enviar notificaciones')
        }
      } catch (error) {
        console.error('Error creating notifications:', error)
        resultado.acciones.push('✗ Error al enviar notificaciones')
      }
    }

    // Guardar en ejecuciones si alerta existe en BD
    if (alerta?.id) {
      try {
        await supabase.from('controller_ejecuciones').insert({
          cliente_id: clienteId,
          alerta_id: alerta.id,
          plataforma: 'ambas',
          disparada: true,
          datos_capturados: { subtipo: alertaSubtipo, manual: true },
          mensaje: `Ejecución manual de alerta ${alertaSubtipo}`,
          ejecutado_at: new Date().toISOString(),
        })
      } catch (error) {
        console.error('Error guardando ejecución (continuando):', error)
      }
    }

    return NextResponse.json(resultado, { status: 200 })
  } catch (error) {
    console.error('[controller/execute] Error:', error)
    return NextResponse.json({ error: 'Error ejecutando alerta', details: String(error) }, { status: 500 })
  }
}
