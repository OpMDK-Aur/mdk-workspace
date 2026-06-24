import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clienteId, alertaSubtipo }: { clienteId: string; alertaSubtipo: string } = body

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

    // Construir descripción detallada de la alerta
    let descripcionDetallada = `Alerta automática disparada por el Controller.\n\n`
    descripcionDetallada += `Tipo de alerta: ${alertaSubtipo}\n`
    
    if (alerta) {
      descripcionDetallada += `Plataforma: ${alerta.plataforma || 'ambas'}\n`
      
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

    // Determinar qué acciones ejecutar
    const accion = alerta?.accion || 'ambas'
    const account_managers = cliente?.account_manager_ids || []

    // ACCIÓN 1: Crear tarea si aplica
    if (accion === 'tarea' || accion === 'ambas') {
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
    if (accion === 'notificacion' || accion === 'ambas') {
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
              descripcion: resumenNotificacion,
              mensaje_largo: descripcionDetallada,
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
