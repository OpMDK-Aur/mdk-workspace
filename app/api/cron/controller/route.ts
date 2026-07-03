import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { evaluarAlerta, getAlertaMeta } from '@/lib/controller-alertas'
import {
  obtenerDatosActuales,
  combinarMetrica,
  calcularBaseline,
  limpiarCacheBaseline,
  ejecutarAccionAlerta,
} from '@/lib/controller-cron'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // tope del plan Hobby (Pro permite hasta 300s)

const COOLDOWN_DIAS = 7

// Wrapper defensivo: si evaluarAlerta tira una excepción por datos raros,
// no debe tumbar la corrida completa del cron.
function evaluarAlertaSafe(
  ...args: Parameters<typeof evaluarAlerta>
): ReturnType<typeof evaluarAlerta> {
  try {
    return evaluarAlerta(...args)
  } catch (err) {
    console.error('[cron/controller] Error en evaluarAlerta:', err)
    return { disparada: false, severidad: 'info', mensaje: '' }
  }
}

export async function GET(request: Request) {
  // Verificación del cron secret, igual que el resto de los crons del sistema
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createAdminClient()
  limpiarCacheBaseline()

  const resumen = {
    evaluadas: 0,
    nuevas_disparadas: 0,
    re_notificadas: 0,
    resueltas: 0,
    sin_cambio: 0,
    omitidas: 0,
    errores: [] as string[],
  }

  try {
    const { data: alertas, error } = await supabaseAdmin
      .from('controller_alertas')
      .select('*')
      .eq('activa', true)

    if (error) throw error
    if (!alertas || alertas.length === 0) {
      return NextResponse.json({ success: true, mensaje: 'No hay alertas activas configuradas.', resumen })
    }

    // Traer todos los clientes involucrados de una sola vez
    const clienteIds = [...new Set(alertas.map((a: any) => a.cliente_id))]
    const { data: clientes } = await supabaseAdmin
      .from('clientes')
      .select('id, nombre_del_negocio, account_manager_ids')
      .in('id', clienteIds)

    const clientesPorId = new Map((clientes || []).map((c: any) => [c.id, c]))

    for (const alerta of alertas) {
      resumen.evaluadas++
      try {
        const cliente = clientesPorId.get(alerta.cliente_id)
        if (!cliente) {
          resumen.errores.push(`Cliente ${alerta.cliente_id} no encontrado (alerta ${alerta.id})`)
          continue
        }

        const meta = getAlertaMeta(alerta.subtipo)
        // Las alertas de categoría "presupuesto" y las de curva/tendencia (sin
        // umbral, solo informativas) no se evalúan automáticamente todavía.
        if (!meta || meta.categoria === 'presupuesto') {
          resumen.omitidas++
          continue
        }

        const periodo = alerta.parametros?.periodo || '7dias'
        const datos = await obtenerDatosActuales(alerta.cliente_id, periodo, supabaseAdmin)
        const metrica = combinarMetrica(datos, alerta.plataforma || 'ambas')

        if (!metrica) {
          // Sin datos (cuenta sin configurar, error de API, etc.) — no se puede evaluar
          resumen.omitidas++
          continue
        }

        const baseline = await calcularBaseline(alerta.cliente_id, supabaseAdmin)
        const resultado = evaluarAlertaSafe(alerta.subtipo, alerta.parametros || {}, metrica, baseline)

        const accountManagers: string[] = cliente.account_manager_ids || []
        const estadoAnterior = alerta.estado_actual || 'normal'
        const ahora = new Date()

        if (resultado.disparada) {
          const yaEstabaDisparada = estadoAnterior === 'disparada'
          const ultimaNotif = alerta.ultima_notificacion ? new Date(alerta.ultima_notificacion) : null
          const diasDesdeUltimaNotif = ultimaNotif
            ? (ahora.getTime() - ultimaNotif.getTime()) / (1000 * 60 * 60 * 24)
            : Infinity

          const debeNotificar = !yaEstabaDisparada || diasDesdeUltimaNotif >= COOLDOWN_DIAS

          if (debeNotificar) {
            const { acciones, omitida } = await ejecutarAccionAlerta({
              supabaseAdmin,
              clienteId: alerta.cliente_id,
              clienteNombre: cliente.nombre_del_negocio,
              accountManagers,
              alertaId: alerta.id,
              alertaSubtipo: alerta.subtipo,
              accion: alerta.accion || 'ambas',
              mensaje: `Alerta automática del Controller.\n\n${resultado.mensaje}\n\nSeveridad: ${resultado.severidad}`,
            })

            await supabaseAdmin
              .from('controller_alertas')
              .update({
                estado_actual: 'disparada',
                disparada_desde: yaEstabaDisparada ? alerta.disparada_desde : ahora.toISOString(),
                ultima_notificacion: ahora.toISOString(),
              })
              .eq('id', alerta.id)

            await supabaseAdmin.from('controller_ejecuciones').insert({
              cliente_id: alerta.cliente_id,
              alerta_id: alerta.id,
              plataforma: alerta.plataforma || 'ambas',
              disparada: true,
              datos_capturados: { subtipo: alerta.subtipo, automatico: true, metrica },
              mensaje: `${yaEstabaDisparada ? 'Re-notificación (7+ días activa)' : 'Nueva detección'}: ${resultado.mensaje}. ${acciones.join(' | ')}`,
              ejecutado_at: ahora.toISOString(),
            })

            if (omitida) resumen.omitidas++
            else if (yaEstabaDisparada) resumen.re_notificadas++
            else resumen.nuevas_disparadas++
          } else {
            resumen.sin_cambio++
          }
        } else {
          if (estadoAnterior === 'disparada') {
            // Se resolvió sola: solo actualizamos el estado, no tocamos
            // la tarea/notificación ya generada (queda como quedó).
            await supabaseAdmin
              .from('controller_alertas')
              .update({
                estado_actual: 'normal',
                disparada_desde: null,
                ultima_notificacion: null,
              })
              .eq('id', alerta.id)

            await supabaseAdmin.from('controller_ejecuciones').insert({
              cliente_id: alerta.cliente_id,
              alerta_id: alerta.id,
              plataforma: alerta.plataforma || 'ambas',
              disparada: false,
              datos_capturados: { subtipo: alerta.subtipo, automatico: true, metrica },
              mensaje: 'Alerta resuelta automáticamente (la métrica volvió a la normalidad).',
              ejecutado_at: ahora.toISOString(),
            })

            resumen.resueltas++
          } else {
            resumen.sin_cambio++
          }
        }
      } catch (err) {
        console.error(`[cron/controller] Error evaluando alerta ${alerta.id}:`, err)
        resumen.errores.push(`Alerta ${alerta.id} (${alerta.subtipo}): ${String(err)}`)
      }
    }

    return NextResponse.json({ success: true, resumen })
  } catch (error) {
    console.error('[cron/controller] Error general:', error)
    return NextResponse.json({ success: false, error: String(error), resumen }, { status: 500 })
  }
}