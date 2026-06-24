import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Función para obtener datos reales de Meta y Google Ads
async function obtenerDatosReales(
  clienteId: string, 
  plataforma: string, 
  periodo: string,
  supabase: any
) {
  const hoy = new Date()
  let fechaInicio: Date, fechaFin: Date, fechaPrevio: Date
  
  // Calcular fechas según el período
  if (periodo === 'hoy') {
    fechaFin = new Date(hoy)
    fechaInicio = new Date(hoy)
    fechaPrevio = new Date(hoy.getTime() - 24 * 60 * 60 * 1000)
  } else if (periodo === '7dias') {
    fechaFin = new Date(hoy)
    fechaInicio = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
    fechaPrevio = new Date(hoy.getTime() - 14 * 24 * 60 * 60 * 1000)
  } else {
    // 30dias
    fechaFin = new Date(hoy)
    fechaInicio = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000)
    fechaPrevio = new Date(hoy.getTime() - 60 * 24 * 60 * 60 * 1000)
  }
  
  const formatoFecha = (d: Date) => d.toISOString().split('T')[0]
  
  const datosActuales: any = {}
  const datosPrevios: any = {}
  
  try {
    // Obtener cuentas del cliente para la plataforma
    if (plataforma === 'meta' || plataforma === 'ambas') {
      const { data: cuentasMeta } = await supabase
        .from('cuentas_publicitarias')
        .select('id_cuenta')
        .eq('cliente_id', clienteId)
        .eq('plataforma', 'meta')
      
      if (cuentasMeta && cuentasMeta.length > 0) {
        // Llamar a API de Meta para obtener datos
        const respMeta = await fetch('/api/ads/meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: formatoFecha(fechaInicio),
            fecha_fin: formatoFecha(fechaFin),
            cuenta_id: cuentasMeta[0].id_cuenta,
          }),
        })
        
        if (respMeta.ok) {
          datosActuales.meta = await respMeta.json()
        }
        
        // Obtener datos del período previo
        const respMetaPrevio = await fetch('/api/ads/meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: formatoFecha(fechaPrevio),
            fecha_fin: formatoFecha(new Date(fechaInicio.getTime() - 1 * 24 * 60 * 60 * 1000)),
            cuenta_id: cuentasMeta[0].id_cuenta,
          }),
        })
        
        if (respMetaPrevio.ok) {
          datosPrevios.meta = await respMetaPrevio.json()
        }
      }
    }
    
    if (plataforma === 'google' || plataforma === 'ambas') {
      const { data: cuentasGoogle } = await supabase
        .from('cuentas_publicitarias')
        .select('id_cuenta')
        .eq('cliente_id', clienteId)
        .eq('plataforma', 'google')
      
      if (cuentasGoogle && cuentasGoogle.length > 0) {
        // Llamar a API de Google Ads para obtener datos
        const respGoogle = await fetch('/api/google-ads/conversions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: formatoFecha(fechaInicio),
            fecha_fin: formatoFecha(fechaFin),
            customer_id: cuentasGoogle[0].id_cuenta,
          }),
        })
        
        if (respGoogle.ok) {
          datosActuales.google = await respGoogle.json()
        }
        
        // Obtener datos del período previo
        const respGooglePrevio = await fetch('/api/google-ads/conversions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: formatoFecha(fechaPrevio),
            fecha_fin: formatoFecha(new Date(fechaInicio.getTime() - 1 * 24 * 60 * 60 * 1000)),
            customer_id: cuentasGoogle[0].id_cuenta,
          }),
        })
        
        if (respGooglePrevio.ok) {
          datosPrevios.google = await respGooglePrevio.json()
        }
      }
    }
  } catch (error) {
    console.error('Error obteniendo datos reales:', error)
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
      
      if (esMeta && metaActual.acciones !== undefined) {
        // Datos reales de Meta
        const accionesActuales = metaActual.acciones || 0
        const accionesPrevias = metaPrevio.acciones || accionesActuales
        const cambioAcciones = calcularCambio(accionesActuales, accionesPrevias)
        const cplActual = metaActual.cpl || 0
        const cplPrevio = metaPrevio.cpl || cplActual
        const cambio CPI = calcularCambio(cplActual, cplPrevio)
        
        if (subtipo === 'caida_conversiones_porcentual') {
          return `Se detectó un cambio del ${cambioAcciones}% en acciones en el período analizado en Meta. Acciones: ${accionesPrevias} → ${accionesActuales}. CPL: $${cplPrevio} → $${cplActual}.`
        } else if (subtipo === 'cpl_aumento_porcentual') {
          return `CPL (Costo por Acción) cambió un ${cambioCPI}% en Meta. CPL anterior: $${cplPrevio} → CPL actual: $${cplActual}. Acciones completadas: ${accionesActuales}.`
        }
      } else if (esGoogle && googleActual.conversiones !== undefined) {
        // Datos reales de Google Ads
        const conversionesActuales = googleActual.conversiones || 0
        const conversionesPrevias = googlePrevio.conversiones || conversionesActuales
        const cambioConversiones = calcularCambio(conversionesActuales, conversionesPrevias)
        const roasActual = googleActual.roas || 0
        const roasPrevio = googlePrevio.roas || roasActual
        const cpcActual = googleActual.cpc || 0
        const cpcPrevio = googlePrevio.cpc || cpcActual
        
        if (subtipo === 'caida_conversiones_porcentual') {
          return `Se detectó un cambio del ${cambioConversiones}% en conversiones en el período analizado en Google Ads. Conversiones: ${conversionesPrevias} → ${conversionesActuales}. ROAS: ${roasPrevio}x → ${roasActual}x.`
        } else if (subtipo === 'cpl_aumento_porcentual') {
          const cambioCPC = calcularCambio(cpcActual, cpcPrevio)
          return `CPC (Costo por Clic) cambió un ${cambioCPC}% en Google Ads. CPC anterior: $${cpcPrevio} → CPC actual: $${cpcActual}. Conversiones: ${conversionesActuales}.`
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
