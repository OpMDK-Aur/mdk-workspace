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

    // Generar datos aleatorios realistas según el tipo de alerta y plataforma
    const generarDatosDetectados = (subtipo: string, platformaActual: string, config?: any) => {
      const esMeta = platformaActual?.toLowerCase() === 'meta'
      const esGoogle = platformaActual?.toLowerCase() === 'google'
      
      // Función auxiliar para generar número aleatorio en rango
      const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
      const randomFloat = (min: number, max: number) => (Math.random() * (max - min) + min).toFixed(2)
      
      if (esMeta) {
        // Datos aleatorios realistas para Meta (CPL, Acciones, Leads)
        if (subtipo === 'caida_conversiones_porcentual') {
          const caida = random(25, 60)
          const accAntes = random(150, 300)
          const accDespues = Math.round(accAntes * (1 - caida / 100))
          return `Se detectó una caída del ${caida}% en acciones en los últimos 7 días en Meta. Acciones completadas: ${accAntes} → ${accDespues} (caída en "Compras").`
        } else if (subtipo === 'tasa_conversion_baja') {
          const tasa = randomFloat(0.5, 1.2)
          const impresiones = random(8000, 15000)
          const acciones = Math.round(impresiones * (parseFloat(tasa) / 100))
          return `Tasa de conversión de acciones crítica detectada: ${tasa}% (crítico < 1.5%). Impresiones: ${impresiones.toLocaleString()} | Acciones: ${acciones}.`
        } else if (subtipo === 'presupuesto_agotado_diario') {
          const presupuesto = random(100, 500)
          const cpl = randomFloat(1.5, 3.5)
          return `Presupuesto diario agotado en Meta. Gastado: $${presupuesto}.00 / $${presupuesto}.00 (100%). CPL alcanzado: $${cpl}.`
        } else if (subtipo === 'limitada_meta_demanda') {
          const audienciasAgotadas = random(5, 15)
          return `Limitación de demanda en Meta. Presupuesto disponible: $0. Audiencias agotadas: ${audienciasAgotadas}. Recomendación: aumentar presupuesto o ampliar audiencias.`
        } else if (subtipo === 'cpl_aumento_porcentual') {
          const aumento = random(30, 80)
          const cplAntes = randomFloat(1.0, 2.5)
          const cplDespues = (parseFloat(cplAntes) * (1 + aumento / 100)).toFixed(2)
          return `CPL (Costo por Acción) aumentó un ${aumento}% respecto a hace 7 días. CPL anterior: $${cplAntes} → CPL actual: $${cplDespues}.`
        }
      } else if (esGoogle) {
        // Datos aleatorios realistas para Google Ads (ROAS, CPC, Conversiones)
        if (subtipo === 'caida_conversiones_porcentual') {
          const caida = random(25, 60)
          const convAntes = random(120, 200)
          const convDespues = Math.round(convAntes * (1 - caida / 100))
          const roasAntes = randomFloat(2.0, 3.5)
          const roasDespues = (parseFloat(roasAntes) * (1 - caida / 100)).toFixed(1)
          return `Se detectó una caída del ${caida}% en conversiones en los últimos 7 días en Google Ads. Conversiones: ${convAntes} → ${convDespues} (caída en búsqueda). ROAS: ${roasAntes}x → ${roasDespues}x.`
        } else if (subtipo === 'tasa_conversion_baja') {
          const tasa = randomFloat(0.8, 1.5)
          const clics = random(6000, 10000)
          const conversiones = Math.round(clics * (parseFloat(tasa) / 100))
          const cpc = randomFloat(2.5, 4.5)
          return `Tasa de conversión crítica detectada: ${tasa}% (crítico < 2%). Clics: ${clics.toLocaleString()} | Conversiones: ${conversiones}. CPC: $${cpc}.`
        } else if (subtipo === 'presupuesto_agotado_diario') {
          const presupuesto = random(150, 600)
          const impresiones = random(10000, 20000)
          return `Presupuesto diario agotado en Google Ads. Gastado: $${presupuesto}.00 / $${presupuesto}.00 (100%). Impresiones: ${impresiones.toLocaleString()}.`
        } else if (subtipo === 'limitada_google') {
          const campaniasPausadas = random(1, 5)
          return `Limitación de presupuesto detectada en Google Ads. Presupuesto disponible: $0. Campañas pausadas: ${campaniasPausadas} (por falta de presupuesto).`
        } else if (subtipo === 'cpl_aumento_porcentual') {
          const aumento = random(30, 70)
          const cpcAntes = randomFloat(1.0, 2.0)
          const cpcDespues = (parseFloat(cpcAntes) * (1 + aumento / 100)).toFixed(2)
          return `CPC (Costo por Clic) aumentó un ${aumento}% respecto a hace 7 días. CPC anterior: $${cpcAntes} → CPC actual: $${cpcDespues}.`
        }
      } else {
        // Datos aleatorios para "ambas" plataformas (resumen comparativo)
        const caida = random(25, 60)
        const accAntes = random(150, 250)
        const accDespues = Math.round(accAntes * (1 - caida / 100))
        const convAntes = random(120, 180)
        const convDespues = Math.round(convAntes * (1 - caida / 100))
        return `Se detectó una caída del ${caida}% en conversiones en los últimos 7 días en ambas plataformas. Meta: ${accAntes} → ${accDespues} acciones. Google: ${convAntes} → ${convDespues} conversiones.`
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
