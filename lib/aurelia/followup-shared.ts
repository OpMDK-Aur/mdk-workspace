export const SURVEY_COUNT = 4

export type Survey = { fecha: string | null; nota: number | null }

export type OnboardingFollowup = {
  clientId: string
  clientName: string | null
  primeraReunion: string | null
  cierreOnboarding: string | null
  encuestas: Survey[]
  updatedAt: string | null
}

export type OnboardingObservation = {
  id: string
  clientId: string
  clientName: string | null
  fecha: string
  comentario: string
  autorName: string | null
  createdAt: string
}

export type AureliaFollowupData =
  | { available: false; message: string }
  | { available: true; followups: OnboardingFollowup[]; observations: OnboardingObservation[] }

export const DEV_STAGES = [
  { id: 'backlog', label: 'Backlog', dot: '#8A8A92' },
  { id: 'revision', label: 'Revisión', dot: '#8B5CF6' },
  { id: 'desarrollo', label: 'Desarrollo', dot: '#3B82F6' },
  { id: 'testing', label: 'Testing', dot: '#F59E0B' },
  { id: 'produccion', label: 'Resolución / Producción', dot: '#22C55E' },
] as const

export type DevStage = (typeof DEV_STAGES)[number]['id']

export const DEV_CATEGORIES = [
  { id: 'error', label: 'Error' },
  { id: 'sugerencia', label: 'Sugerencia' },
] as const

export type DevCategory = (typeof DEV_CATEGORIES)[number]['id']

export const isDevStage = (value: unknown): value is DevStage => DEV_STAGES.some((stage) => stage.id === value)
export const isDevCategory = (value: unknown): value is DevCategory => DEV_CATEGORIES.some((category) => category.id === value)

export type DevTask = {
  id: string
  titulo: string
  descripcion: string | null
  etapa: DevStage
  categoria: DevCategory
  fechaPedido: string
  fechaFin: string | null
  asignadoId: string | null
  asignadoName: string | null
  creadoPorId: string | null
  creadoPorName: string | null
  clientId: string | null
  clientName: string | null
  posicion: number
  updatedAt: string
}

export type TeamMember = { id: string; name: string }

export type AureliaDevData =
  | { available: false; message: string }
  | { available: true; tasks: DevTask[]; team: TeamMember[]; viewerId: string }

export const emptyFollowup = (clientId: string, clientName: string | null = null): OnboardingFollowup => ({
  clientId,
  clientName,
  primeraReunion: null,
  cierreOnboarding: null,
  encuestas: Array.from({ length: SURVEY_COUNT }, () => ({ fecha: null, nota: null })),
  updatedAt: null,
})

/** Última encuesta con nota cargada (la de número más alto). */
export function latestSurvey(followup: OnboardingFollowup | undefined): (Survey & { index: number }) | null {
  if (!followup) return null
  for (let index = followup.encuestas.length - 1; index >= 0; index -= 1) {
    const survey = followup.encuestas[index]
    if (survey.nota !== null) return { ...survey, index }
  }
  return null
}

export type NpsCategory = 'promotor' | 'pasivo' | 'detractor'

export const npsCategory = (nota: number): NpsCategory => (nota >= 9 ? 'promotor' : nota >= 7 ? 'pasivo' : 'detractor')

/** NPS clásico (% promotores − % detractores) sobre la última nota de cada cliente. */
export function computeNps(followups: OnboardingFollowup[]) {
  const notes = followups.map((followup) => latestSurvey(followup)?.nota).filter((nota): nota is number => nota !== null && nota !== undefined)
  const promotores = notes.filter((nota) => npsCategory(nota) === 'promotor').length
  const detractores = notes.filter((nota) => npsCategory(nota) === 'detractor').length
  return {
    respuestas: notes.length,
    promotores,
    pasivos: notes.length - promotores - detractores,
    detractores,
    score: notes.length ? Math.round(((promotores - detractores) / notes.length) * 100) : null,
  }
}

export const isMissingTable = (error: { code?: string; message: string }) =>
  error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message)

export const MIGRATION_MESSAGE = 'Todavía no se crearon las tablas de seguimiento (falta correr scripts/aurelia-onboarding-desarrollo.sql).'

/** Formatea una fecha sin hora (YYYY-MM-DD) sin correrla de día por la zona horaria. */
export function formatDay(value: string | null, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR', options)
}

/** Fecha YYYY-MM-DD válida o null. */
export function parseDateOnly(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Fecha inválida.')
  const date = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error('Fecha inválida.')
  return text
}

/** Nota NPS entera de 0 a 10 o null. */
export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const score = Number(value)
  if (!Number.isInteger(score) || score < 0 || score > 10) throw new Error('La nota tiene que ser un número entero de 0 a 10.')
  return score
}
