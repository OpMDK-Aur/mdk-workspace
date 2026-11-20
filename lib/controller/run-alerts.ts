import { evaluarAlerta, getAlertaMeta } from '@/lib/controller-alertas'
import { obtenerDatosActuales, combinarMetrica, calcularBaseline, limpiarCacheBaseline, ejecutarAccionAlerta } from '@/lib/controller-cron'
import type { createClient as createAdminClient } from '@/lib/supabase/admin'

const COOLDOWN_DIAS = 7

export type ResumenAlertas = {
  evaluadas: number
  nuevas_disparadas: number
  re_notificadas: number
  resueltas: number
  sin_cambio: number
  omitidas: number
  pendientes: number
  errores: string[]
}

type Opciones = {
  /** Limita la evaluación a estos clientes. Sin valor evalúa todas las alertas activas. */
  clienteIds?: string[]
  /** Corta antes de este instante (ms) para no pasarse del tope de la función. */
  deadline?: number
  concurrencia?: number
}

// Si evaluarAlerta tira una excepción por datos raros, no debe tumbar la corrida completa.
function evaluarAlertaSafe(...args: Parameters<typeof evaluarAlerta>): ReturnType<typeof evaluarAlerta> {
  try {
    return evaluarAlerta(...args)
  } catch (err) {
    console.error('[controller] Error en evaluarAlerta:', err)
    return { disparada: false, severidad: 'info', mensaje: '' }
  }
}

/** Evalúa las alertas activas del Controller y notifica las que se disparan (mismo flujo que el cron diario). */
export async function ejecutarAlertas(supabaseAdmin: ReturnType<typeof createAdminClient>, { clienteIds, deadline, concurrencia = 4 }: Opciones = {}): Promise<ResumenAlertas> {
  const resumen: ResumenAlertas = { evaluadas: 0, nuevas_disparadas: 0, re_notificadas: 0, resueltas: 0, sin_cambio: 0, omitidas: 0, pendientes: 0, errores: [] }
  limpiarCacheBaseline()

  if (clienteIds && clienteIds.length === 0) return resumen
  let query = supabaseAdmin.from('controller_alertas').select('*').eq('activa', true)
  if (clienteIds) query = query.in('cliente_id', clienteIds)
  const { data: alertas, error } = await query
  if (error) throw error
  if (!alertas?.length) return resumen

  const ids = [...new Set(alertas.map((a: any) => a.cliente_id))]
  const { data: clientes } = await supabaseAdmin.from('clientes').select('id, nombre_del_negocio, account_manager_ids').in('id', ids)
  const clientesPorId = new Map((clientes || []).map((c: any) => [c.id, c]))

  const procesar = async (alerta: any) => {
    resumen.evaluadas++
    try {
      const cliente = clientesPorId.get(alerta.cliente_id)
      if (!cliente) {
        resumen.errores.push(`Cliente ${alerta.cliente_id} no encontrado (alerta ${alerta.id})`)
        return
      }

      const meta = getAlertaMeta(alerta.subtipo)
      // Las alertas de categoría "presupuesto" todavía no se evalúan automáticamente.
      if (!meta || meta.categoria === 'presupuesto') {
        resumen.omitidas++
        return
      }

      const periodo = alerta.parametros?.periodo || '7dias'
      const datos = await obtenerDatosActuales(alerta.cliente_id, periodo, supabaseAdmin)
      const metrica = combinarMetrica(datos, alerta.plataforma || 'ambas')
      if (!metrica) {
        resumen.omitidas++
        return
      }

      const baseline = await calcularBaseline(alerta.cliente_id, supabaseAdmin)
      const resultado = evaluarAlertaSafe(alerta.subtipo, alerta.parametros || {}, metrica, baseline)
      const accountManagers: string[] = cliente.account_manager_ids || []
      const estadoAnterior = alerta.estado_actual || 'normal'
      const ahora = new Date()

      if (resultado.disparada) {
        const yaEstabaDisparada = estadoAnterior === 'disparada'
        const ultimaNotif = alerta.ultima_notificacion ? new Date(alerta.ultima_notificacion) : null
        const diasDesdeUltimaNotif = ultimaNotif ? (ahora.getTime() - ultimaNotif.getTime()) / (1000 * 60 * 60 * 24) : Infinity
        if (yaEstabaDisparada && diasDesdeUltimaNotif < COOLDOWN_DIAS) {
          resumen.sin_cambio++
          return
        }

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

        await supabaseAdmin.from('controller_alertas').update({
          estado_actual: 'disparada',
          disparada_desde: yaEstabaDisparada ? alerta.disparada_desde : ahora.toISOString(),
          ultima_notificacion: ahora.toISOString(),
        }).eq('id', alerta.id)

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
      } else if (estadoAnterior === 'disparada') {
        // Se resolvió sola: se actualiza el estado sin tocar la tarea o notificación ya generada.
        await supabaseAdmin.from('controller_alertas').update({ estado_actual: 'normal', disparada_desde: null, ultima_notificacion: null }).eq('id', alerta.id)
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
    } catch (err) {
      console.error(`[controller] Error evaluando alerta ${alerta.id}:`, err)
      resumen.errores.push(`Alerta ${alerta.id} (${alerta.subtipo}): ${String(err)}`)
    }
  }

  const cola = [...alertas]
  const trabajadores = Array.from({ length: Math.max(1, concurrencia) }, async () => {
    while (cola.length) {
      if (deadline && Date.now() > deadline) return
      await procesar(cola.shift())
    }
  })
  await Promise.all(trabajadores)
  resumen.pendientes = cola.length
  return resumen
}
