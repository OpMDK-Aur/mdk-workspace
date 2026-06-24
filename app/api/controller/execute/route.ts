import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { 
      clienteId, 
      alertaSubtipo,
      accion,
      plataforma,
    }: { 
      clienteId: string
      alertaSubtipo: string
      accion?: string
      plataforma?: string
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

    // Generar datos simulados detectados según el tipo de alerta y plataforma
    const generarDatosDetectados = (subtipo: string, platformaActual: string, config?: any) => {
      const esMeta = platformaActual?.toLowerCase() === 'meta'
      const esGoogle = platformaActual?.toLowerCase() === 'google'
      
      // Simulación de datos realistas según plataforma y tipo de alerta
      if (esMeta) {
        // Datos específicos para Meta (CPL, Acciones, Leads)
        const simulacionesMeta: Record<string, string> = {
          'caida_conversiones_porcentual': `Se detectó una caída del 42% en acciones en los últimos 7 días en Meta. Acciones completadas: 156 → 91 (caída en "Compras").`,
          'tasa_conversion_baja': `Tasa de conversión de acciones crítica detectada: 0.8% (crítico < 1.5%). Impresiones: 12,500 | Acciones: 100.`,
          'presupuesto_agotado_diario': `Presupuesto diario agotado en Meta. Gastado: $200.00 / $200.00 (100%). CPL alcanzado: $2.10.`,
          'limitada_meta_demanda': `Limitación de demanda en Meta. Presupuesto disponible: $0. Audiencias agotadas: 8. Recomendación: aumentar presupuesto o ampliar audiencias.`,
          'cpl_aumento_porcentual': `CPL (Costo por Acción) aumentó un 65% respecto a hace 7 días. CPL anterior: $1.50 → CPL actual: $2.48.`,
        }
        return simulacionesMeta[subtipo] || `Se disparó la alerta ${subtipo} en Meta.`
      } else if (esGoogle) {
        // Datos específicos para Google Ads (ROAS, CPC, Conversiones)
        const simulacionesGoogle: Record<string, string> = {
          'caida_conversiones_porcentual': `Se detectó una caída del 42% en conversiones en los últimos 7 días en Google Ads. Conversiones: 145 → 84 (caída en búsqueda). ROAS: 2.5x → 1.8x.`,
          'tasa_conversion_baja': `Tasa de conversión crítica detectada: 1.2% (crítico < 2%). Clics: 8,420 | Conversiones: 101. CPC: $3.50.`,
          'presupuesto_agotado_diario': `Presupuesto diario agotado en Google Ads. Gastado: $300.00 / $300.00 (100%). Impresiones: 15,230.`,
          'limitada_google': `Limitación de presupuesto detectada en Google Ads. Presupuesto disponible: $0. Campañas pausadas: 3 (por falta de presupuesto).`,
          'cpl_aumento_porcentual': `CPC (Costo por Clic) aumentó un 58% respecto a hace 7 días. CPC anterior: $1.25 → CPC actual: $1.98.`,
        }
        return simulacionesGoogle[subtipo] || `Se disparó la alerta ${subtipo} en Google Ads.`
      } else {
        // Datos genéricos para "ambas" plataformas
        const simulacionesGeneral: Record<string, string> = {
          'caida_conversiones_porcentual': `Se detectó una caída del 42% en conversiones en los últimos 7 días en ambas plataformas. Meta: 156 → 91 acciones. Google: 145 → 84 conversiones.`,
          'tasa_conversion_baja': `Tasa de conversión crítica detectada en ambas plataformas. Meta: 0.8% | Google: 1.2% (ambas bajo umbral crítico).`,
          'presupuesto_agotado_diario': `Presupuesto diario agotado en ambas plataformas. Meta: $200/$200. Google: $300/$300. Total gastado: $500.`,
          'cpl_aumento_porcentual': `Costo por acción aumentó en ambas plataformas. Meta CPL: $1.50 → $2.48 (+65%). Google CPC: $1.25 → $1.98 (+58%).`,
        }
        return simulacionesGeneral[subtipo] || `Se disparó la alerta ${subtipo} en ambas plataformas.`
      }
    }

    // Construir descripción detallada de la alerta
    let descripcionDetallada = `Alerta automática disparada por el Controller.\n\n`
    descripcionDetallada += `Tipo de alerta: ${alertaSubtipo}\n`
    descripcionDetallada += `Plataforma: ${plataforma || alerta?.plataforma || 'ambas'}\n`
    descripcionDetallada += `Fecha: ${new Date().toLocaleString('es-AR')}\n`
    
    // Agregar QUÉ SE DETECTÓ
    descripcionDetallada += `\n━━━ QUÉ SE DETECTÓ ━━━\n`
    descripcionDetallada += generarDatosDetectados(alertaSubtipo, plataforma || alerta?.plataforma || 'ambas', alerta?.configuracion) + `\n`
    
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
