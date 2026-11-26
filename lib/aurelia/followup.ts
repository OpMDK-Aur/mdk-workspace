import { createClient as createAdminClient } from '@/lib/supabase/admin'
import {
  MIGRATION_MESSAGE,
  SURVEY_COUNT,
  isDevCategory,
  isDevStage,
  isMissingTable,
  COMMENTS_MIGRATION_MESSAGE,
  type AureliaDevData,
  type DevComment,
  type DevCommentsData,
  type AureliaFollowupData,
  type DevTask,
  type OnboardingFollowup,
  type OnboardingObservation,
  type TeamMember,
} from './followup-shared'

export const FOLLOWUP_TABLE = 'aurelia_onboarding_seguimiento'
export const OBSERVATIONS_TABLE = 'aurelia_onboarding_observaciones'
export const DEV_TASKS_TABLE = 'aurelia_tareas_desarrollo'
export const DEV_COMMENTS_TABLE = 'aurelia_tareas_desarrollo_comentarios'

const PAGE_SIZE = 1000
const MAX_ROWS = 10000

type Row = Record<string, unknown>
type Person = { nombre: string | null; apellido: string | null } | null

const personName = (person: Person) => [person?.nombre, person?.apellido].filter(Boolean).join(' ') || null
const str = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** Pagina por `order` y desempata por `key` (único) para que las páginas no se pisen. */
async function fetchAll(table: string, columns: string, order: { column: string; ascending: boolean }, key = 'id') {
  const admin = createAdminClient()
  const rows: Row[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let query = admin.from(table).select(columns).order(order.column, { ascending: order.ascending })
    if (key !== order.column) query = query.order(key)
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) return { rows, error }
    rows.push(...((data ?? []) as unknown as Row[]))
    if ((data ?? []).length < PAGE_SIZE) break
  }
  return { rows, error: null }
}

const toFollowup = (row: Row): OnboardingFollowup => ({
  clientId: String(row.aurelia_client_id),
  clientName: str(row.aurelia_client_name),
  primeraReunion: str(row.fecha_primer_reunion),
  cierreOnboarding: str(row.fecha_cierre_onboarding),
  encuestas: Array.from({ length: SURVEY_COUNT }, (_, index) => {
    const nota = row[`encuesta_${index + 1}_nota`]
    return { fecha: str(row[`encuesta_${index + 1}_fecha`]), nota: typeof nota === 'number' ? nota : null }
  }),
  updatedAt: str(row.updated_at),
})

const toObservation = (row: Row): OnboardingObservation => ({
  id: String(row.id),
  clientId: String(row.aurelia_client_id),
  clientName: str(row.aurelia_client_name),
  fecha: String(row.fecha),
  comentario: String(row.comentario ?? ''),
  autorName: personName(row.autor as Person),
  createdAt: String(row.created_at),
})

export async function getAureliaFollowupData(): Promise<AureliaFollowupData> {
  const [followups, observations] = await Promise.all([
    fetchAll(FOLLOWUP_TABLE, '*', { column: 'aurelia_client_id', ascending: true }, 'aurelia_client_id'),
    fetchAll(OBSERVATIONS_TABLE, 'id,aurelia_client_id,aurelia_client_name,fecha,comentario,created_at,autor:colaboradores!autor_id(nombre,apellido)', { column: 'fecha', ascending: false }),
  ])
  const error = followups.error ?? observations.error
  if (error) return { available: false, message: isMissingTable(error) ? MIGRATION_MESSAGE : `No se pudo cargar el seguimiento: ${error.message}` }
  return {
    available: true,
    followups: followups.rows.map(toFollowup),
    observations: observations.rows.map(toObservation).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt)),
  }
}

const toDevTask = (row: Row): DevTask => ({
  id: String(row.id),
  titulo: String(row.titulo ?? ''),
  descripcion: str(row.descripcion),
  etapa: isDevStage(row.etapa) ? row.etapa : 'backlog',
  categoria: isDevCategory(row.categoria) ? row.categoria : 'sugerencia',
  fechaPedido: String(row.fecha_pedido),
  fechaFin: str(row.fecha_fin),
  asignadoId: str(row.asignado_a),
  asignadoName: personName(row.asignado as Person),
  creadoPorId: str(row.creado_por),
  creadoPorName: personName(row.creador as Person),
  clientId: str(row.aurelia_client_id),
  clientName: str(row.aurelia_client_name),
  prioridad: row.prioridad === true,
  posicion: Number(row.posicion) || 0,
  updatedAt: String(row.updated_at),
})

async function getTeam(): Promise<TeamMember[]> {
  const { data, error } = await createAdminClient().from('colaboradores').select('*').limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[])
    .filter((row) => row.activo !== false)
    .map((row) => ({ id: String(row.id), name: personName(row as unknown as Person) ?? str(row.email) ?? 'Sin nombre' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function getAureliaDevData(viewerId: string): Promise<AureliaDevData> {
  try {
    const [tasks, team] = await Promise.all([
      fetchAll(DEV_TASKS_TABLE, '*,asignado:colaboradores!asignado_a(nombre,apellido),creador:colaboradores!creado_por(nombre,apellido)', { column: 'posicion', ascending: true }),
      getTeam(),
    ])
    if (tasks.error) return { available: false, message: isMissingTable(tasks.error) ? MIGRATION_MESSAGE : `No se pudieron cargar las tareas: ${tasks.error.message}` }
    return { available: true, tasks: tasks.rows.map(toDevTask), team, viewerId }
  } catch (error) {
    return { available: false, message: error instanceof Error ? `No se pudo cargar el equipo: ${error.message}` : 'No se pudo cargar el equipo.' }
  }
}

type Author = { nombre: string | null; apellido: string | null; avatar_url?: string | null } | null

export async function getDevTaskComments(taskId: string, viewerId: string): Promise<DevCommentsData> {
  const { data, error } = await createAdminClient()
    .from(DEV_COMMENTS_TABLE)
    .select('id,tarea_id,autor_id,contenido,editado,created_at,autor:colaboradores!autor_id(nombre,apellido,avatar_url)')
    .eq('tarea_id', taskId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) return { available: false, message: isMissingTable(error) ? COMMENTS_MIGRATION_MESSAGE : `No se pudieron cargar los comentarios: ${error.message}` }
  const comments: DevComment[] = ((data ?? []) as unknown as Row[]).map((row) => {
    const autor = row.autor as Author
    return {
      id: String(row.id),
      tareaId: String(row.tarea_id),
      autorId: str(row.autor_id),
      autorName: personName(autor) ?? 'Usuario',
      autorAvatar: str(autor?.avatar_url),
      contenido: String(row.contenido ?? ''),
      editado: row.editado === true,
      createdAt: String(row.created_at),
    }
  })
  return { available: true, comments, viewerId }
}
