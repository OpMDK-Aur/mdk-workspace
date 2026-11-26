'use server'

import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getAureliaViewer } from '@/lib/aurelia/access'
import { DEV_COMMENTS_TABLE, DEV_TASKS_TABLE, FOLLOWUP_TABLE, OBSERVATIONS_TABLE } from '@/lib/aurelia/followup'
import { COMMENTS_MIGRATION_MESSAGE, MIGRATION_MESSAGE, SURVEY_COUNT, isMissingColumn, isDevCategory, isDevStage, isMissingTable, parseDateOnly, parseScore, type DevCategory, type DevStage, type Survey } from '@/lib/aurelia/followup-shared'
import { todayInArgentina } from '@/lib/aurelia/time-shared'

type Result = { error: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireViewer() {
  const viewer = await getAureliaViewer()
  if (!viewer) throw new Error('Tu sesión expiró. Volvé a iniciar sesión.')
  if (!viewer.canAccess) throw new Error('No tenés acceso a Aurelia.')
  return viewer
}

const cleanText = (value: string | null | undefined, max: number) => {
  const text = String(value ?? '').trim().slice(0, max)
  return text || null
}

function validateClientId(value: string | null | undefined, required: boolean) {
  const id = String(value ?? '').trim()
  if (!id) {
    if (required) throw new Error('Elegí un cliente.')
    return null
  }
  if (id.length > 100) throw new Error('Cliente inválido.')
  return id
}

function validateMemberId(value: string | null | undefined) {
  const id = String(value ?? '').trim()
  if (!id) return null
  if (!UUID.test(id)) throw new Error('Colaborador inválido.')
  return id
}

function check(error: { code?: string; message: string } | null) {
  if (error) throw new Error(isMissingTable(error) ? MIGRATION_MESSAGE : error.message)
}

async function run(action: () => Promise<void>): Promise<Result> {
  try {
    await action()
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo guardar.' }
  }
}

export async function saveOnboardingFollowup(input: { clientId: string; clientName: string | null; primeraReunion: string | null; cierreOnboarding: string | null; encuestas: Survey[] }): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    const clientId = validateClientId(input.clientId, true)
    const primeraReunion = parseDateOnly(input.primeraReunion)
    const cierreOnboarding = parseDateOnly(input.cierreOnboarding)
    if (primeraReunion && cierreOnboarding && cierreOnboarding < primeraReunion) throw new Error('El cierre del onboarding no puede ser anterior a la primera reunión.')
    const surveys: Record<string, string | number | null> = {}
    for (let index = 0; index < SURVEY_COUNT; index += 1) {
      const survey = input.encuestas?.[index]
      surveys[`encuesta_${index + 1}_fecha`] = parseDateOnly(survey?.fecha)
      surveys[`encuesta_${index + 1}_nota`] = parseScore(survey?.nota)
    }
    const { error } = await createAdminClient().from(FOLLOWUP_TABLE).upsert({
      aurelia_client_id: clientId,
      aurelia_client_name: cleanText(input.clientName, 200),
      fecha_primer_reunion: primeraReunion,
      fecha_cierre_onboarding: cierreOnboarding,
      ...surveys,
      actualizado_por: viewer.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'aurelia_client_id' })
    check(error)
  })
}

export async function addOnboardingObservation(input: { clientId: string; clientName: string | null; fecha: string | null; comentario: string }): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    const clientId = validateClientId(input.clientId, true)
    const comentario = cleanText(input.comentario, 4000)
    if (!comentario) throw new Error('Escribí la observación.')
    const { error } = await createAdminClient().from(OBSERVATIONS_TABLE).insert({
      aurelia_client_id: clientId,
      aurelia_client_name: cleanText(input.clientName, 200),
      fecha: parseDateOnly(input.fecha) ?? todayInArgentina(),
      comentario,
      autor_id: viewer.userId,
    })
    check(error)
  })
}

export async function deleteOnboardingObservation(id: string): Promise<Result> {
  return run(async () => {
    await requireViewer()
    if (!UUID.test(String(id))) throw new Error('Observación inválida.')
    const { error } = await createAdminClient().from(OBSERVATIONS_TABLE).delete().eq('id', id)
    check(error)
  })
}

type DevTaskInput = {
  titulo: string
  descripcion: string | null
  etapa: DevStage
  categoria: DevCategory
  fechaPedido: string | null
  fechaFin: string | null
  asignadoId: string | null
  clientId: string | null
  clientName: string | null
  /** Se manda solo si cambió, así crear/editar sigue andando antes de correr la migración de prioridad. */
  prioridad?: boolean
}

const PRIORITY_MIGRATION_MESSAGE = 'Para marcar prioridad falta correr scripts/aurelia-tareas-prioridad-comentarios.sql.'

function checkTask(error: { code?: string; message: string } | null) {
  if (error && isMissingColumn(error)) throw new Error(PRIORITY_MIGRATION_MESSAGE)
  check(error)
}

/** Confirma que la prioridad quedó guardada; si la columna no vuelve, la API todavía no la ve. */
function assertPriority(values: { prioridad?: boolean }, rows: Record<string, unknown>[] | null) {
  if (typeof values.prioridad !== 'boolean') return
  const saved = rows?.[0]?.prioridad
  if (saved !== values.prioridad) throw new Error(`${PRIORITY_MIGRATION_MESSAGE} Si ya la corriste, ejecutá NOTIFY pgrst, 'reload schema'; para que la API vea la columna nueva.`)
}

function devTaskValues(input: DevTaskInput) {
  const titulo = cleanText(input.titulo, 200)
  if (!titulo) throw new Error('Poné un título.')
  if (!isDevStage(input.etapa)) throw new Error('Etapa inválida.')
  if (!isDevCategory(input.categoria)) throw new Error('Categoría inválida.')
  const fechaPedido = parseDateOnly(input.fechaPedido) ?? todayInArgentina()
  const fechaFin = parseDateOnly(input.fechaFin)
  if (fechaFin && fechaFin < fechaPedido) throw new Error('La fecha de fin no puede ser anterior a la fecha del pedido.')
  const clientId = validateClientId(input.clientId, false)
  return {
    titulo,
    descripcion: cleanText(input.descripcion, 10000),
    etapa: input.etapa,
    categoria: input.categoria,
    fecha_pedido: fechaPedido,
    fecha_fin: fechaFin,
    asignado_a: validateMemberId(input.asignadoId),
    aurelia_client_id: clientId,
    aurelia_client_name: clientId ? cleanText(input.clientName, 200) : null,
    ...(typeof input.prioridad === 'boolean' ? { prioridad: input.prioridad } : {}),
  }
}

export async function createDevTask(input: DevTaskInput): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    const values = devTaskValues(input)
    const { data, error } = await createAdminClient().from(DEV_TASKS_TABLE).insert({ ...values, creado_por: viewer.userId, posicion: Date.now() / 1000 }).select('*')
    checkTask(error)
    assertPriority(values, data)
  })
}

export async function updateDevTask(id: string, input: DevTaskInput): Promise<Result> {
  return run(async () => {
    await requireViewer()
    if (!UUID.test(String(id))) throw new Error('Tarea inválida.')
    const values = devTaskValues(input)
    const { data, error } = await createAdminClient().from(DEV_TASKS_TABLE).update({ ...values, updated_at: new Date().toISOString() }).eq('id', id).select('*')
    checkTask(error)
    if (!data?.length) throw new Error('La tarea ya no existe.')
    assertPriority(values, data)
  })
}

/** Mueve una tarea de columna (y de categoría dentro del Backlog) y la deja al final. */
export async function moveDevTask(id: string, etapa: DevStage, categoria?: DevCategory): Promise<Result> {
  return run(async () => {
    await requireViewer()
    if (!UUID.test(String(id))) throw new Error('Tarea inválida.')
    if (!isDevStage(etapa)) throw new Error('Etapa inválida.')
    if (categoria !== undefined && !isDevCategory(categoria)) throw new Error('Categoría inválida.')
    const { error } = await createAdminClient().from(DEV_TASKS_TABLE).update({
      etapa,
      ...(categoria ? { categoria } : {}),
      posicion: Date.now() / 1000,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    check(error)
  })
}

export async function deleteDevTask(id: string): Promise<Result> {
  return run(async () => {
    await requireViewer()
    if (!UUID.test(String(id))) throw new Error('Tarea inválida.')
    const { error } = await createAdminClient().from(DEV_TASKS_TABLE).delete().eq('id', id)
    check(error)
  })
}

function checkComment(error: { code?: string; message: string } | null) {
  if (error) throw new Error(isMissingTable(error) ? COMMENTS_MIGRATION_MESSAGE : error.message)
}

function commentText(value: string) {
  const text = cleanText(value, 4000)
  if (!text) throw new Error('Escribí un comentario.')
  return text
}

export async function addDevComment(taskId: string, contenido: string): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    if (!UUID.test(String(taskId))) throw new Error('Tarea inválida.')
    const { error } = await createAdminClient().from(DEV_COMMENTS_TABLE).insert({ tarea_id: taskId, autor_id: viewer.userId, contenido: commentText(contenido) })
    checkComment(error)
  })
}

/** Solo el autor puede editar o borrar su comentario: el filtro por `autor_id` lo garantiza en la consulta. */
export async function updateDevComment(id: string, contenido: string): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    if (!UUID.test(String(id))) throw new Error('Comentario inválido.')
    const { data, error } = await createAdminClient()
      .from(DEV_COMMENTS_TABLE)
      .update({ contenido: commentText(contenido), editado: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('autor_id', viewer.userId)
      .select('id')
    checkComment(error)
    if (!data?.length) throw new Error('Solo podés editar tus comentarios.')
  })
}

export async function deleteDevComment(id: string): Promise<Result> {
  return run(async () => {
    const viewer = await requireViewer()
    if (!UUID.test(String(id))) throw new Error('Comentario inválido.')
    const { data, error } = await createAdminClient().from(DEV_COMMENTS_TABLE).delete().eq('id', id).eq('autor_id', viewer.userId).select('id')
    checkComment(error)
    if (!data?.length) throw new Error('Solo podés borrar tus comentarios.')
  })
}
