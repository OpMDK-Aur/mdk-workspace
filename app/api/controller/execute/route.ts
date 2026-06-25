import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchMetaTotals, fetchGoogleTotals } from '@/lib/ads-data'

// Calcula rangos de fecha (actual vs previo) según el período configurado
function calcularRangos(periodo: string) {
  const hoy = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  if (periodo === 'hoy') {
    const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000)
    return {
      actual: { since: fmt(hoy), until: fmt(hoy) },
      previo: { since: fmt(ayer), until: fmt(ayer) },
    }
  } else if (periodo === '30dias') {
    const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000)
    const hace60 = new Date(hoy.getTime() - 60 * 24 * 60 * 60 * 1000)
    const hace30Menos1 = new Date(hace30.getTime() - 24 * 60 * 60 * 1000)
    return {
      actual: { since: fmt(hace30), until: fmt(hoy) },
      previo: { since: fmt(hace60), until: fmt(hace30Menos1) },
    }
  }
  // 7dias (default)
  const hace7 = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000)
  const hace14 = new Date(hoy.getTime() - 14 * 24 * 60 * 60 * 1000)
  const hace7Menos1 = new Date(hace7.getTime() - 24 * 60 * 60 * 1000)
  return {
    actual: { since: fmt(hace7), until: fmt(hoy) },
    previo: { since: fmt(hace14), until: fmt(hace7Menos1) },
  }
}

// Obtiene datos REALES llamando directamente a las APIs (sin HTTP a rutas propias)
async function obtenerDatosReales(
  clienteId: string,
  plataforma: string,
  periodo: string,
  supabase: any
) {
  const datosActuales: any = {}
  const datosPrevios: any = {}
  const errores: string[] = []

  try {
    const { data: cuentas } = await supabase
      .from('cuentas_publicitarias')
      .select('id_cuenta, plataforma')
      .eq('cliente_id', clienteId)
      .eq('activo', true)

    if (!cuentas || cuentas.length === 0) {
      return { datosActuales, datosPrevios, periodo, errores: ['No hay cuentas publicitarias configuradas para este cliente.'] }
    }

    const rangos = calcularRangos(periodo)

    // META
    const cuentaMeta = cuentas.find((c: any) => c.plataforma === 'meta')
    if (cuentaMeta && (plataforma === 'meta' || plataforma === 'ambas')) {
      const [actual, previo] = await Promise.all([
        fetchMetaTotals(cuentaMeta.id_cuenta, rangos.actual.since, rangos.actual.until),
        fetchMetaTotals(cuentaMeta.id_cuenta, rangos.previo.since, rangos.previo.until),
      ])
      if (actual.error) errores.push(`Meta: ${actual.error}`)
      datosActuales.meta = actual.totals
      datosPrevios.meta = previo.totals
    }

    // GOOGLE
    const cuentaGoogle = cuentas.find((c: any) => c.plataforma === 'google')
    if (cuentaGoogle && (plataforma === 'google' || plataforma === 'ambas')) {
      const [actual, previo] = await Promise.all([
        fetchGoogleTotals(cuentaGoogle.id_cuenta, rangos.actual.since, rangos.actual.until),
        fetchGoogleTotals(cuentaGoogle.id_cuenta, rangos.previo.since, rangos.previo.until),
      ])
      if (actual.error) errores.push(`Google: ${actual.error}`)
      datosActuales.google = actual.totals
      datosPrevios.google = previo.totals
    }
  } catch (error) {
    console.error('[controller/execute] Error obteniendo datos reales:', error)
    errores.push(String(error))
  }

  return { datosActuales, datosPrevios, periodo, errores }
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

    // Calcula porcentaje de cambio entre dos valores
    const calcularCambio = (actual: number, anterior: number) => {
      if (!anterior || anterior === 0) return '0'
      return (((actual - anterior) / anterior) * 100).toFixed(1)
    }

    // Genera el bloque de métricas reales para una plataforma específica
    const lineaMeta = (subtipo: string, actual: any, previo: any) => {
      const leadsAct = actual.leads || 0
      const leadsPrev = previo.leads || 0
      const cplAct = actual.cpl || 0
      const cplPrev = previo.cpl || 0
      const spend = actual.spend || 0
      const impressions = actual.impressions || 0
      const clicks = actual.clicks || 0

      if (subtipo === 'caida_conversiones_porcentual') {
        return `Meta: cambio del ${calcularCambio(leadsAct, leadsPrev)}% en resultados. Resultados: ${leadsPrev} → ${leadsAct}. Inversión: $${spend.toFixed(2)}. CPL: $${cplAct.toFixed(2)}.`
      } else if (subtipo === 'cpl_aumento_porcentual') {
        return `Meta: CPL cambió ${calcularCambio(cplAct, cplPrev)}%. CPL: $${cplPrev.toFixed(2)} → $${cplAct.toFixed(2)}. Resultados: ${leadsAct}. Inversión: $${spend.toFixed(2)}.`
      } else if (subtipo === 'presupuesto_agotado_diario') {
        return `Meta: inversión del período $${spend.toFixed(2)}. Resultados: ${leadsAct}. CPL: $${cplAct.toFixed(2)}.`
      } else if (subtipo === 'tasa_conversion_baja') {
        const tasa = clicks > 0 ? ((leadsAct / clicks) * 100).toFixed(2) : '0'
        return `Meta: tasa de conversión ${tasa}%. Clics: ${clicks} | Resultados: ${leadsAct} | Impresiones: ${impressions}.`
      }
      return `Meta: Resultados ${leadsAct} | Inversión $${spend.toFixed(2)} | CPL $${cplAct.toFixed(2)}.`
    }

    const lineaGoogle = (subtipo: string, actual: any, previo: any) => {
      const convAct = actual.conversions || 0
      const convPrev = previo.conversions || 0
      const cpcAct = actual.cpc || 0
      const cpcPrev = previo.cpc || 0
      const spend = actual.spend || 0
      const clicks = actual.clicks || 0
      const impressions = actual.impressions || 0

      if (subtipo === 'caida_conversiones_porcentual') {
        return `Google Ads: cambio del ${calcularCambio(convAct, convPrev)}% en conversiones. Conversiones: ${convPrev} → ${convAct}. Inversión: $${spend.toFixed(2)}. CPC: $${cpcAct.toFixed(2)}.`
      } else if (subtipo === 'cpl_aumento_porcentual') {
        return `Google Ads: CPC cambió ${calcularCambio(cpcAct, cpcPrev)}%. CPC: $${cpcPrev.toFixed(2)} → $${cpcAct.toFixed(2)}. Conversiones: ${convAct}. Inversión: $${spend.toFixed(2)}.`
      } else if (subtipo === 'presupuesto_agotado_diario') {
        return `Google Ads: inversión del período $${spend.toFixed(2)}. Clics: ${clicks}. Conversiones: ${convAct}.`
      } else if (subtipo === 'tasa_conversion_baja') {
        const tasa = clicks > 0 ? ((convAct / clicks) * 100).toFixed(2) : '0'
        return `Google Ads: tasa de conversión ${tasa}%. Clics: ${clicks} | Conversiones: ${convAct} | Impresiones: ${impressions}.`
      }
      return `Google Ads: Conversiones ${convAct} | Inversión $${spend.toFixed(2)} | CPC $${cpcAct.toFixed(2)}.`
    }

    // Generar descripción con datos reales de las APIs
    const generarDatosDetectados = (subtipo: string, platformaActual: string, datos: any) => {
      const plat = platformaActual?.toLowerCase()
      const metaActual = datos.datosActuales?.meta
      const metaPrevio = datos.datosPrevios?.meta
      const googleActual = datos.datosActuales?.google
      const googlePrevio = datos.datosPrevios?.google

      const lineas: string[] = []

      if ((plat === 'meta' || plat === 'ambas') && metaActual) {
        lineas.push(lineaMeta(subtipo, metaActual, metaPrevio || {}))
      }
      if ((plat === 'google' || plat === 'ambas') && googleActual) {
        lineas.push(lineaGoogle(subtipo, googleActual, googlePrevio || {}))
      }

      // Si hubo errores y no hay datos, mostrarlos para diagnóstico
      if (lineas.length === 0) {
        if (datos.errores && datos.errores.length > 0) {
          return `No se pudieron obtener datos reales. Motivo: ${datos.errores.join(' | ')}`
        }
        return `Se disparó la alerta ${subtipo} en ${platformaActual}. Período analizado: ${datos.periodo}. (Sin datos disponibles para el período)`
      }

      const sufijoPeriodo = datos.periodo === 'hoy' ? 'Hoy vs Ayer' : datos.periodo === '30dias' ? 'Últimos 30 días vs 30 previos' : 'Últimos 7 días vs 7 previos'
      return `${lineas.join('\n')}\n(Período: ${sufijoPeriodo})`
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

    // ACCIÓN "ninguna": solo se registra/visualiza en el panel de alertas,
    // sin crear tarea ni enviar notificación.
    if (accionFinal === 'ninguna') {
      resultado.acciones.push('• Sin acción: la alerta solo se muestra en el panel de alertas')
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
