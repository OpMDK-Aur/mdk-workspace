// Lógica compartida para la detección AUTOMÁTICA de alertas del Controller
// (usada por el cron /api/cron/controller). Corre sin sesión de usuario, por
// lo que usa siempre el cliente admin (service role) y no depende de auth.getUser().

import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { fetchMetaTotals, fetchGoogleTotals, type AdsTotals } from '@/lib/ads-data'
import {
  evaluarAlerta,
  type AlertaParametros,
  type BaselineCliente,
  type MetricaCampania,
  type ResultadoDeteccion,
} from '@/lib/controller-alertas'

const fmt = (d: Date) => d.toISOString().split('T')[0]

// ── Fetch de métricas del período actual (para evaluar la alerta) ───────────────

export interface DatosPlataforma {
  meta: AdsTotals | null
  google: AdsTotals | null
  errores: string[]
}

export async function obtenerDatosActuales(
  clienteId: string,
  periodo: string,
  supabaseAdmin: ReturnType<typeof createAdminClient>
): Promise<DatosPlataforma> {
  const errores: string[] = []
  let meta: AdsTotals | null = null
  let google: AdsTotals | null = null

  const { data: cuentas } = await supabaseAdmin
    .from('cuentas_publicitarias')
    .select('id_cuenta, plataforma')
    .eq('cliente_id', clienteId)
    .eq('activo', true)

  if (!cuentas || cuentas.length === 0) {
    return { meta: null, google: null, errores: ['No hay cuentas publicitarias configuradas.'] }
  }

  const hoy = new Date()
  let since: string, until: string
  if (periodo === 'hoy') {
    since = until = fmt(hoy)
  } else if (periodo === '30dias') {
    since = fmt(new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000))
    until = fmt(hoy)
  } else {
    since = fmt(new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000))
    until = fmt(hoy)
  }

  const cuentaMeta = cuentas.find((c: any) => c.plataforma === 'meta')
  const cuentaGoogle = cuentas.find((c: any) => c.plataforma === 'google')

  if (cuentaMeta) {
    const r = await fetchMetaTotals(cuentaMeta.id_cuenta, since, until)
    if (r.error) errores.push(`Meta: ${r.error}`)
    else meta = r.totals
  }
  if (cuentaGoogle) {
    const r = await fetchGoogleTotals(cuentaGoogle.id_cuenta, since, until)
    if (r.error) errores.push(`Google: ${r.error}`)
    else google = r.totals
  }

  return { meta, google, errores }
}

// Combina meta+google (según la plataforma configurada en la alerta) en una
// única MetricaCampania para pasarle a evaluarAlerta.
export function combinarMetrica(datos: DatosPlataforma, plataforma: string): MetricaCampania | null {
  const usarMeta = plataforma === 'meta' || plataforma === 'ambas'
  const usarGoogle = plataforma === 'google' || plataforma === 'ambas'

  const fuentes: AdsTotals[] = []
  if (usarMeta && datos.meta) fuentes.push(datos.meta)
  if (usarGoogle && datos.google) fuentes.push(datos.google)

  if (fuentes.length === 0) return null

  const spend = fuentes.reduce((a, f) => a + f.spend, 0)
  const clicks = fuentes.reduce((a, f) => a + f.clicks, 0)
  const impressions = fuentes.reduce((a, f) => a + f.impressions, 0)
  const leads = fuentes.reduce((a, f) => a + f.leads, 0)

  return {
    cpl: leads > 0 ? spend / leads : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    leads,
    clicks,
    impressions,
    spend,
    budget: null, // Alertas de presupuesto no soportadas todavía en detección automática
  }
}

// ── Baseline de 30 días (para alertas comparativas: "aumentó X% vs promedio") ───

const baselineCache = new Map<string, Promise<BaselineCliente>>()

export function calcularBaseline(
  clienteId: string,
  supabaseAdmin: ReturnType<typeof createAdminClient>
): Promise<BaselineCliente> {
  // Cachea por cliente dentro de la misma corrida del cron (varias alertas
  // configuradas para el mismo cliente comparten el mismo baseline).
  if (baselineCache.has(clienteId)) return baselineCache.get(clienteId)!

  const promise = (async (): Promise<BaselineCliente> => {
    const vacio: BaselineCliente = {
      cplPromedio: 0,
      ctrPromedio: 0,
      spendPromedio: 0,
      tasaConversionPromedio: 0,
    }

    const datos = await obtenerDatosActuales(clienteId, '30dias', supabaseAdmin)
    const metrica = combinarMetrica(datos, 'ambas')
    if (!metrica) return vacio

    return {
      cplPromedio: metrica.leads > 0 ? metrica.spend / metrica.leads : 0,
      ctrPromedio: metrica.impressions > 0 ? (metrica.clicks / metrica.impressions) * 100 : 0,
      spendPromedio: metrica.spend / 30,
      tasaConversionPromedio: metrica.clicks > 0 ? metrica.leads / metrica.clicks : 0,
    }
  })()

  baselineCache.set(clienteId, promise)
  return promise
}

export function limpiarCacheBaseline() {
  baselineCache.clear()
}

// ── Ejecución de acciones (tarea / notificación) sin usuario logueado ───────────

export interface EjecutarAccionParams {
  supabaseAdmin: ReturnType<typeof createAdminClient>
  clienteId: string
  clienteNombre: string
  accountManagers: string[]
  alertaId: string
  alertaSubtipo: string
  accion: string // 'tarea' | 'notificacion' | 'ambas' | 'ninguna'
  mensaje: string // descripción del detalle detectado
}

export interface EjecutarAccionResultado {
  acciones: string[]
  omitida: boolean // true si no había a quién asignar
}

export async function ejecutarAccionAlerta(p: EjecutarAccionParams): Promise<EjecutarAccionResultado> {
  const acciones: string[] = []

  if (p.accountManagers.length === 0) {
    return {
      acciones: ['✗ Sin Account Managers configurados para este cliente — no se generó tarea ni notificación'],
      omitida: true,
    }
  }

  const titulo = `[Alerta Controller] ${p.alertaSubtipo} — ${p.clienteNombre}`

  if (p.accion === 'tarea' || p.accion === 'ambas') {
    try {
      const { data: tarea, error } = await p.supabaseAdmin
        .from('tareas')
        .insert({
          titulo,
          descripcion: p.mensaje,
          cliente_ids: [p.clienteId],
          asignado_a: p.accountManagers[0],
          asignados_a: p.accountManagers,
          prioridad: 'media',
          estado: 'pendiente',
        })
        .select()
        .maybeSingle()

      if (error) {
        console.error('[controller/cron] Error creando tarea:', error)
        acciones.push(`✗ Error al crear tarea: ${error.message}`)
      } else if (tarea) {
        acciones.push(`✓ Tarea creada (ID: ${tarea.id})`)
      }
    } catch (error) {
      console.error('[controller/cron] Error creando tarea:', error)
      acciones.push('✗ Error al crear tarea')
    }
  }

  if (p.accion === 'notificacion' || p.accion === 'ambas') {
    try {
      const { error } = await p.supabaseAdmin.from('notificaciones').insert(
        p.accountManagers.map((colaboradorId) => ({
          colaborador_id: colaboradorId,
          tipo: 'alerta_controller',
          titulo,
          descripcion: p.mensaje,
          referencia_id: p.alertaId,
          referencia_tipo: 'alerta_controller',
          cliente_id: p.clienteId,
          leida: false,
        }))
      )

      if (error) {
        console.error('[controller/cron] Error creando notificaciones:', error)
        acciones.push(`✗ Error al enviar notificaciones: ${error.message}`)
      } else {
        acciones.push(`✓ ${p.accountManagers.length} notificación(es) enviada(s)`)
      }
    } catch (error) {
      console.error('[controller/cron] Error creando notificaciones:', error)
      acciones.push('✗ Error al enviar notificaciones')
    }
  }

  if (p.accion === 'ninguna') {
    acciones.push('• Sin acción configurada: la alerta solo queda visible en el panel')
  }

  return { acciones, omitida: false }
}