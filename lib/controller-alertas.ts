// ── Fuente única de verdad para las alertas del Controller ──────────────────────
// Usada por el config sheet (para guardar categoria/tipo) y por el panel del
// dashboard (para detectar alertas según la configuración del paid media).

export type AlertaCategoria = 'rendimiento' | 'presupuesto'

export interface AlertaMeta {
  subtipo: string
  categoria: AlertaCategoria
  tipo: string // grupo, p.ej. 'CPA Elevado'
  label: string
  badgeLabel: string // etiqueta corta para el badge del dashboard
  campos: string[]
}

// Catálogo completo de alertas configurables
export const ALERTAS_META: AlertaMeta[] = [
  // RENDIMIENTO ─ CPA Elevado
  { subtipo: 'cpl_aumento_porcentual', categoria: 'rendimiento', tipo: 'CPA Elevado', label: 'CPL aumenta más de X% respecto a los últimos N días', badgeLabel: 'CPL en aumento', campos: ['porcentaje', 'dias'] },
  { subtipo: 'cpl_supera_objetivo', categoria: 'rendimiento', tipo: 'CPA Elevado', label: 'CPL supera el objetivo establecido', badgeLabel: 'CPL sobre objetivo', campos: ['cpl_objetivo'] },
  { subtipo: 'cpl_supera_ticket', categoria: 'rendimiento', tipo: 'CPA Elevado', label: 'CPL superior al ticket promedio permitido', badgeLabel: 'CPL sobre ticket', campos: ['ticket_promedio'] },
  // RENDIMIENTO ─ Caída de Conversiones
  { subtipo: 'caida_conversiones_porcentual', categoria: 'rendimiento', tipo: 'Caída de Conversiones', label: 'Las conversiones caen más del X%', badgeLabel: 'Caída conversiones', campos: ['porcentaje', 'leads_referencia'] },
  { subtipo: 'sin_conversiones_horas', categoria: 'rendimiento', tipo: 'Caída de Conversiones', label: 'Sin conversiones durante X horas', badgeLabel: 'Sin conversiones', campos: ['horas'] },
  { subtipo: 'tasa_conversion_baja', categoria: 'rendimiento', tipo: 'Caída de Conversiones', label: 'Tasa de conversión baja respecto al promedio', badgeLabel: 'Conversión baja', campos: [] },
  // RENDIMIENTO ─ CTR Bajo
  { subtipo: 'ctr_bajo_benchmark', categoria: 'rendimiento', tipo: 'CTR Bajo', label: 'CTR inferior al benchmark de la cuenta', badgeLabel: 'CTR bajo benchmark', campos: ['ctr_benchmark'] },
  { subtipo: 'ctr_caida_semanal', categoria: 'rendimiento', tipo: 'CTR Bajo', label: 'CTR cae más del X% vs semana anterior', badgeLabel: 'CTR en caída', campos: ['porcentaje'] },
  // PRESUPUESTO ─ Presupuesto Agotado
  { subtipo: 'presupuesto_hora_limite', categoria: 'presupuesto', tipo: 'Presupuesto Agotado', label: 'Presupuesto agotado antes de determinada hora', badgeLabel: 'Presup. agotado', campos: ['hora_limite'] },
  { subtipo: 'presupuesto_agotado_diario', categoria: 'presupuesto', tipo: 'Presupuesto Agotado', label: 'Presupuesto agotado todos los días de la semana', badgeLabel: 'Presup. agotado', campos: [] },
  // PRESUPUESTO ─ Limitada por Presupuesto
  { subtipo: 'limitada_google', categoria: 'presupuesto', tipo: 'Limitada por Presupuesto', label: 'Google informa "Limitada por presupuesto"', badgeLabel: 'Limitada presup.', campos: [] },
  { subtipo: 'limitada_meta_demanda', categoria: 'presupuesto', tipo: 'Limitada por Presupuesto', label: 'Meta detecta alta demanda con presupuesto insuficiente', badgeLabel: 'Limitada presup.', campos: [] },
  // PRESUPUESTO ─ Gasto Anormal
  { subtipo: 'gasto_anormal_alto', categoria: 'presupuesto', tipo: 'Gasto Anormal', label: 'Gastó mucho más de lo habitual', badgeLabel: 'Gasto alto', campos: ['desvio_maximo'] },
  { subtipo: 'gasto_anormal_bajo', categoria: 'presupuesto', tipo: 'Gasto Anormal', label: 'Gastó mucho menos de lo habitual', badgeLabel: 'Gasto bajo', campos: ['desvio_minimo'] },
  { subtipo: 'sin_gasto_horas', categoria: 'presupuesto', tipo: 'Gasto Anormal', label: 'Sin gasto durante las últimas X horas', badgeLabel: 'Sin gasto', campos: ['horas'] },
]

export const ALERTA_META_BY_SUBTIPO: Record<string, AlertaMeta> = ALERTAS_META.reduce(
  (acc, a) => {
    acc[a.subtipo] = a
    return acc
  },
  {} as Record<string, AlertaMeta>
)

export function getAlertaMeta(subtipo: string): AlertaMeta | undefined {
  return ALERTA_META_BY_SUBTIPO[subtipo]
}

// ── Tipos de la configuración persistida (controller_alertas) ───────────────────

export interface AlertaParametros {
  campos?: Record<string, string | number>
  variantes?: Array<Record<string, string | number>>
  periodo?: string
}

export interface AlertaConfigurada {
  id?: string
  cliente_id: string
  categoria: string
  tipo: string
  subtipo: string
  plataforma: string // 'meta' | 'google' | 'ambas'
  parametros: AlertaParametros
  accion: string
  activa: boolean
}

// Convierte un valor de parámetro (puede venir como string) a número
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

// ── Detección de alertas a partir de una métrica de campaña ─────────────────────

export interface MetricaCampania {
  cpl: number
  ctr: number
  leads: number
  clicks: number
  impressions: number
  spend: number
  budget: number | null
}

// Promedios de referencia (a nivel cliente) para alertas comparativas
export interface BaselineCliente {
  cplPromedio: number
  ctrPromedio: number
  spendPromedio: number
  tasaConversionPromedio: number // leads/clicks promedio
}

export type SeveridadDetectada = 'critical' | 'warning' | 'info'

export interface ResultadoDeteccion {
  disparada: boolean
  severidad: SeveridadDetectada
  mensaje: string
}

// Evalúa un subtipo de alerta contra una métrica de campaña usando los
// parámetros configurados por el paid media. Devuelve si se dispara y el detalle.
export function evaluarAlerta(
  subtipo: string,
  parametros: AlertaParametros,
  m: MetricaCampania,
  baseline: BaselineCliente
): ResultadoDeteccion {
  const campos = parametros.campos || {}
  const noDispara: ResultadoDeteccion = { disparada: false, severidad: 'info', mensaje: '' }

  switch (subtipo) {
    case 'cpl_supera_objetivo': {
      const objetivo = num(campos.cpl_objetivo)
      if (objetivo === null || m.spend <= 0 || m.cpl <= 0) return noDispara
      if (m.cpl > objetivo) {
        return {
          disparada: true,
          severidad: m.cpl > objetivo * 1.5 ? 'critical' : 'warning',
          mensaje: `CPL $${m.cpl.toFixed(0)} supera el objetivo $${objetivo.toFixed(0)}`,
        }
      }
      return noDispara
    }

    case 'cpl_supera_ticket': {
      const ticket = num(campos.ticket_promedio)
      if (ticket === null || m.spend <= 0 || m.cpl <= 0) return noDispara
      if (m.cpl > ticket) {
        return {
          disparada: true,
          severidad: m.cpl > ticket * 1.5 ? 'critical' : 'warning',
          mensaje: `CPL $${m.cpl.toFixed(0)} supera el ticket promedio $${ticket.toFixed(0)}`,
        }
      }
      return noDispara
    }

    case 'cpl_aumento_porcentual': {
      // Sin histórico por campaña, se compara contra el promedio del cliente
      const pct = num(campos.porcentaje)
      if (pct === null || baseline.cplPromedio <= 0 || m.cpl <= 0 || m.spend <= 0) return noDispara
      const umbral = baseline.cplPromedio * (1 + pct / 100)
      if (m.cpl > umbral) {
        const variacion = ((m.cpl - baseline.cplPromedio) / baseline.cplPromedio) * 100
        return {
          disparada: true,
          severidad: variacion > pct * 1.5 ? 'critical' : 'warning',
          mensaje: `CPL $${m.cpl.toFixed(0)} (+${variacion.toFixed(0)}% vs promedio $${baseline.cplPromedio.toFixed(0)})`,
        }
      }
      return noDispara
    }

    case 'caida_conversiones_porcentual': {
      const pct = num(campos.porcentaje)
      const ref = num(campos.leads_referencia)
      if (pct === null) return noDispara
      // Si hay leads de referencia configurados, comparar directo
      if (ref !== null && ref > 0) {
        const caida = ((ref - m.leads) / ref) * 100
        if (caida >= pct) {
          return {
            disparada: true,
            severidad: caida >= pct * 1.5 ? 'critical' : 'warning',
            mensaje: `Conversiones cayeron ${caida.toFixed(0)}% (${ref} → ${m.leads})`,
          }
        }
      }
      return noDispara
    }

    case 'sin_conversiones_horas': {
      // Aproximación con datos agregados: sin leads habiendo invertido
      if (m.leads === 0 && m.spend > 0) {
        return {
          disparada: true,
          severidad: 'warning',
          mensaje: `Sin conversiones con $${m.spend.toFixed(0)} invertidos`,
        }
      }
      return noDispara
    }

    case 'tasa_conversion_baja': {
      if (m.clicks <= 0 || baseline.tasaConversionPromedio <= 0) return noDispara
      const tasa = m.leads / m.clicks
      // Baja = menos de la mitad del promedio del cliente
      if (tasa < baseline.tasaConversionPromedio * 0.5) {
        return {
          disparada: true,
          severidad: 'warning',
          mensaje: `Tasa de conversión ${(tasa * 100).toFixed(1)}% (promedio ${(baseline.tasaConversionPromedio * 100).toFixed(1)}%)`,
        }
      }
      return noDispara
    }

    case 'ctr_bajo_benchmark': {
      const benchmark = num(campos.ctr_benchmark)
      if (benchmark === null || m.impressions <= 0) return noDispara
      if (m.ctr < benchmark) {
        return {
          disparada: true,
          severidad: m.ctr < benchmark * 0.5 ? 'critical' : 'warning',
          mensaje: `CTR ${m.ctr.toFixed(2)}% bajo el benchmark ${benchmark.toFixed(2)}%`,
        }
      }
      return noDispara
    }

    case 'ctr_caida_semanal': {
      const pct = num(campos.porcentaje)
      if (pct === null || baseline.ctrPromedio <= 0 || m.impressions <= 0) return noDispara
      const umbral = baseline.ctrPromedio * (1 - pct / 100)
      if (m.ctr < umbral) {
        const caida = ((baseline.ctrPromedio - m.ctr) / baseline.ctrPromedio) * 100
        return {
          disparada: true,
          severidad: caida > pct * 1.5 ? 'critical' : 'warning',
          mensaje: `CTR ${m.ctr.toFixed(2)}% (-${caida.toFixed(0)}% vs promedio ${baseline.ctrPromedio.toFixed(2)}%)`,
        }
      }
      return noDispara
    }

    case 'presupuesto_agotado_diario':
    case 'presupuesto_hora_limite': {
      if (m.budget && m.budget > 0 && m.spend >= m.budget) {
        return {
          disparada: true,
          severidad: 'warning',
          mensaje: `Presupuesto agotado: $${m.spend.toFixed(0)} de $${m.budget.toFixed(0)}`,
        }
      }
      return noDispara
    }

    case 'gasto_anormal_alto': {
      const desvio = num(campos.desvio_maximo)
      if (desvio === null || baseline.spendPromedio <= 0) return noDispara
      const umbral = baseline.spendPromedio * (1 + desvio / 100)
      if (m.spend > umbral) {
        return {
          disparada: true,
          severidad: 'warning',
          mensaje: `Gasto $${m.spend.toFixed(0)} supera lo habitual (+${desvio}% sobre $${baseline.spendPromedio.toFixed(0)})`,
        }
      }
      return noDispara
    }

    case 'gasto_anormal_bajo': {
      const desvio = num(campos.desvio_minimo)
      if (desvio === null || baseline.spendPromedio <= 0) return noDispara
      const umbral = baseline.spendPromedio * (1 - desvio / 100)
      if (m.spend > 0 && m.spend < umbral) {
        return {
          disparada: true,
          severidad: 'info',
          mensaje: `Gasto $${m.spend.toFixed(0)} por debajo de lo habitual (-${desvio}% bajo $${baseline.spendPromedio.toFixed(0)})`,
        }
      }
      return noDispara
    }

    case 'sin_gasto_horas': {
      if (m.spend === 0) {
        return {
          disparada: true,
          severidad: 'warning',
          mensaje: 'Sin gasto registrado en el período',
        }
      }
      return noDispara
    }

    // Subtipos basados en estado de plataforma que no se pueden derivar de métricas agregadas
    case 'limitada_google':
    case 'limitada_meta_demanda':
    default:
      return noDispara
  }
}
