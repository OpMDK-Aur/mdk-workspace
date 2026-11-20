import { getAlertaMeta } from '../controller-alertas'

export const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires'

export type InicioTask = { id: string; titulo: string; estado: string; clienteNombre: string | null; vence: string | null; reunionInicio: string | null; reunionFin: string | null; meetUrl: string | null; esReunion: boolean }
export type InicioAlert = { id: string; clienteId: string; clienteNombre: string; subtipo: string; plataforma: string | null; desde: string | null; mensaje: string | null }
export type InicioData = { nombre: string; tareas: InicioTask[]; vencidas: number; alertas: InicioAlert[]; segundosHoy: number; timerCorriendo: boolean }

/** Inicio y fin del día de hoy en Argentina, como ISO con offset. */
export function todayRange(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: AR_TIME_ZONE }).format(now)
  const start = new Date(`${day}T00:00:00-03:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { day, start: start.toISOString(), end: end.toISOString() }
}

export const ALERT_GROUPS = [
  { id: 'impresiones', title: 'Sin impresiones', subtipos: ['cero_impresiones'] },
  { id: 'conversiones', title: 'Sin conversiones o en caída', subtipos: ['sin_conversiones_horas', 'caida_conversiones_porcentual', 'conversiones_tendencia_7d', 'conversiones_tendencia_14d', 'conversiones_tendencia_30d'] },
  { id: 'cpl', title: 'CPL alto', subtipos: ['cpl_supera_objetivo', 'cpl_aumento_porcentual', 'cpl_tendencia_7d', 'cpl_tendencia_14d', 'cpl_tendencia_30d'] },
  { id: 'presupuesto', title: 'Presupuesto y gasto', subtipos: ['presupuesto_cerca_limite', 'limitada_google', 'gasto_anormal_bajo'] },
] as const

const RECENT_MS = 48 * 60 * 60 * 1000
export const isRecentAlert = (alert: InicioAlert, now = Date.now()) => Boolean(alert.desde && now - new Date(alert.desde).getTime() < RECENT_MS)

/** Agrupa las alertas disparadas en el orden en que conviene revisarlas; las recién activadas van primero dentro de cada grupo. */
export function groupAlerts(alerts: InicioAlert[], now = Date.now()) {
  const known = new Set<string>(ALERT_GROUPS.flatMap((group) => group.subtipos))
  const sort = (items: InicioAlert[]) => [...items].sort((a, b) => Number(isRecentAlert(b, now)) - Number(isRecentAlert(a, now)) || (b.desde ?? '').localeCompare(a.desde ?? ''))
  const groups: Array<{ id: string; title: string; alerts: InicioAlert[] }> = ALERT_GROUPS.map((group) => ({ id: group.id, title: group.title, alerts: sort(alerts.filter((alert) => (group.subtipos as readonly string[]).includes(alert.subtipo))) }))
  groups.push({ id: 'otras', title: 'Otras alertas', alerts: sort(alerts.filter((alert) => !known.has(alert.subtipo))) })
  return groups.filter((group) => group.alerts.length > 0)
}

export const alertLabel = (subtipo: string) => getAlertaMeta(subtipo)?.badgeLabel ?? subtipo.replace(/_/g, ' ')

export function formatWorked(seconds: number) {
  const total = Math.max(0, Math.floor(seconds / 60))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (!hours) return `${minutes} min`
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || ''

const PHRASES = [
  'Lo urgente rara vez es importante. Lo importante rara vez es urgente.',
  'Una campaña sin conversiones es solo una opinión con presupuesto.',
  'Tomate un vaso de agua. El algoritmo de Meta puede esperar dos minutos.',
  'Hecho es mejor que perfecto. Y publicado es mejor que hecho.',
  'Si el CPL sube, respirá. Si baja, también respirá, pero sonriendo.',
  'Nadie se acuerda del día que todo salió bien, pero vos sí vas a saber por qué.',
  'Pará cinco minutos y mirá por la ventana. Los mejores insights no aparecen en el Ads Manager.',
  'Un cliente bien informado es un cliente tranquilo. Un mensaje a tiempo vale más que diez reportes.',
  'Hoy es un buen día para apagar ese anuncio que nadie se anima a apagar.',
  'El mate se enfría, las campañas no. Priorizá en consecuencia.',
  'No compitas con la competencia: competí con tu versión de ayer.',
  'Las métricas cuentan qué pasó. Vos decidís qué pasa después.',
  'Cerrá una pestaña. Ahora otra. ¿Ves? El día ya pesa menos.',
  'Si una tarea lleva menos de dos minutos, hacela ahora y tachala con ganas.',
  'El mejor momento para revisar el presupuesto fue ayer. El segundo mejor es ahora.',
  'Dato curioso: los pulpos tienen tres corazones. Vos con uno solo ya bancás a todos tus clientes.',
  'Trabajar mucho no es lo mismo que avanzar. Elegí las tres cosas que mueven la aguja hoy.',
  'Estirá la espalda. En serio, ahora. Te lo agradece el yo de las seis de la tarde.',
]

/** Una frase distinta cada día, la misma durante todo el día para la misma persona. */
export function phraseOfTheDay(day: string, seed = '') {
  let hash = 0
  for (const char of `${day}:${seed}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PHRASES[hash % PHRASES.length]
}
