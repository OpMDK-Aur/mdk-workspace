import 'server-only'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getUserGoogleDocsAccessToken } from '@/lib/google-tokens'
import { matchClientByTitle, type ClientRef } from '@/lib/google-calendar/meetings'
import { exportDocText, listTranscriptDocs, type DriveTranscriptFile } from './google-drive'
import { parseTranscriptDocName, transcriptExcerpt } from './parse'

export const TRANSCRIPTS_TABLE = 'transcripciones_clientes'
const UNIQUE_VIOLATION = '23505'
const MEETING_WINDOW_MS = 6 * 60 * 60 * 1000

export type TranscriptRecord = {
  id: string
  cliente_id: string
  titulo: string
  fecha_reunion: string | null
  contenido: string
  fuente: 'google_docs' | 'manual'
  google_doc_id: string | null
  google_doc_url: string | null
  tarea_id: string | null
  comentario_id: string | null
  subido_por: string | null
  created_at: string
}

export class DocsNotConnectedError extends Error {
  constructor() {
    super('Conectá Google Docs en Conectores para traer las transcripciones.')
  }
}

type Admin = ReturnType<typeof createAdminClient>
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const formatMeetingDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso)) : null

export function buildTranscriptComment(input: { title: string; meetingDate: string | null; content: string; docUrl?: string | null }) {
  return [
    `**Transcripción de reunión:** ${input.title}`,
    formatMeetingDate(input.meetingDate),
    transcriptExcerpt(input.content),
    input.docUrl ? `Documento completo: ${input.docUrl}` : 'La transcripción completa está en la pestaña Transcripciones.',
  ].filter(Boolean).join('\n\n')
}

export async function collaboratorName(admin: Admin, userId: string) {
  const { data } = await admin.from('colaboradores').select('nombre, apellido').eq('id', userId).maybeSingle()
  return [data?.nombre, data?.apellido].filter(Boolean).join(' ') || 'Equipo'
}

/**
 * Busca a qué cliente pertenece una reunión: primero por la tarea de
 * calendario de esa persona con el mismo título y horario cercano, y si no,
 * por el nombre del cliente dentro del título.
 */
export async function resolveTranscriptClient(admin: Admin, userId: string, meetingTitle: string, meetingDate: string | null, clients: ClientRef[]) {
  if (meetingDate) {
    const at = new Date(meetingDate).getTime()
    const { data: tasks } = await admin
      .from('tareas')
      .select('id, titulo, cliente_id, reunion_inicio')
      .eq('creado_por', userId)
      .not('google_calendar_event_id', 'is', null)
      .gte('reunion_inicio', new Date(at - MEETING_WINDOW_MS).toISOString())
      .lte('reunion_inicio', new Date(at + MEETING_WINDOW_MS).toISOString())
      .limit(20)
    const title = normalize(meetingTitle)
    const task = (tasks ?? []).find((row) => row.cliente_id && normalize(String(row.titulo ?? '')).startsWith(title))
    if (task) return { clientId: task.cliente_id as string, taskId: task.id as string }
  }
  const client = matchClientByTitle(meetingTitle, clients)
  return client ? { clientId: client.id, taskId: null } : null
}

export async function loadClientRefs(admin: Admin) {
  const { data } = await admin.from('clientes').select('id, nombre_del_negocio').limit(5000)
  return (data ?? []) as ClientRef[]
}

/**
 * Guarda la transcripción y publica el comentario en el cliente. Si el mismo
 * documento ya estaba cargado en ese cliente devuelve `duplicate` sin tocar nada.
 */
export async function saveTranscript(admin: Admin, input: {
  clientId: string
  title: string
  meetingDate: string | null
  content: string
  source: 'google_docs' | 'manual'
  docId?: string | null
  docUrl?: string | null
  taskId?: string | null
  uploadedBy: { id: string; name: string }
}): Promise<{ status: 'created' | 'duplicate'; transcript: TranscriptRecord | null }> {
  if (input.docId) {
    const { data: existing } = await admin.from(TRANSCRIPTS_TABLE).select('*').eq('cliente_id', input.clientId).eq('google_doc_id', input.docId).maybeSingle()
    if (existing) return { status: 'duplicate', transcript: existing as TranscriptRecord }
  }

  const comment = {
    cliente_id: input.clientId,
    contenido: buildTranscriptComment(input),
    autor: input.uploadedBy.name,
    colaborador_id: input.uploadedBy.id,
    tipo: 'transcripcion',
  }
  let { data: commentRow, error: commentError } = await admin.from('comentarios_clientes').insert(comment).select('id').single()
  // Si la columna `tipo` tiene una lista cerrada de valores, se guarda el comentario sin tipo.
  if (commentError?.code === '23514' || commentError?.code === '22P02') {
    const { tipo: _tipo, ...withoutType } = comment
    ;({ data: commentRow, error: commentError } = await admin.from('comentarios_clientes').insert(withoutType).select('id').single())
  }
  if (commentError) console.error('[transcripts] No se pudo crear el comentario:', commentError.message)

  const { data, error } = await admin
    .from(TRANSCRIPTS_TABLE)
    .insert({
      cliente_id: input.clientId,
      titulo: input.title.slice(0, 300),
      fecha_reunion: input.meetingDate,
      contenido: input.content,
      fuente: input.source,
      google_doc_id: input.docId ?? null,
      google_doc_url: input.docUrl ?? null,
      tarea_id: input.taskId ?? null,
      comentario_id: commentRow?.id ?? null,
      subido_por: input.uploadedBy.id,
    })
    .select('*')
    .single()

  if (error) {
    if (commentRow?.id) await admin.from('comentarios_clientes').delete().eq('id', commentRow.id)
    if (error.code === UNIQUE_VIOLATION) return { status: 'duplicate', transcript: null }
    throw new Error(`No se pudo guardar la transcripción: ${error.message}`)
  }
  return { status: 'created', transcript: data as TranscriptRecord }
}

export type SyncResult = {
  created: Array<{ clientId: string; title: string }>
  unmatched: Array<{ docId: string; title: string; meetingDate: string | null; url: string | null }>
  alreadySynced: number
}

/**
 * Trae las transcripciones nuevas del Drive de una persona y las carga en el
 * cliente que corresponda. Las que no se pueden asociar quedan en `unmatched`
 * para vincularlas a mano.
 */
export async function syncUserTranscripts(userId: string, options: { sinceDays: number; admin?: Admin }): Promise<SyncResult> {
  const admin = options.admin ?? createAdminClient()
  const accessToken = await getUserGoogleDocsAccessToken(userId)
  if (!accessToken) throw new DocsNotConnectedError()

  const files = await listTranscriptDocs(accessToken, new Date(Date.now() - options.sinceDays * 86_400_000))
  const result: SyncResult = { created: [], unmatched: [], alreadySynced: 0 }
  if (files.length === 0) return result

  const { data: known } = await admin.from(TRANSCRIPTS_TABLE).select('google_doc_id').in('google_doc_id', files.map((file) => file.id))
  const knownIds = new Set((known ?? []).map((row) => row.google_doc_id as string))
  const pending = files.filter((file) => !knownIds.has(file.id))
  result.alreadySynced = files.length - pending.length
  if (pending.length === 0) return result

  const [clients, uploaderName] = await Promise.all([loadClientRefs(admin), collaboratorName(admin, userId)])
  for (const file of pending) {
    const { meetingTitle, meetingDate } = parseTranscriptDocName(file.name)
    const date = meetingDate ?? file.createdTime
    const match = await resolveTranscriptClient(admin, userId, meetingTitle, date, clients)
    if (!match) {
      result.unmatched.push(toUnmatched(file, meetingTitle, date))
      continue
    }
    const content = await exportDocText(accessToken, file.id)
    if (!content) continue
    const saved = await saveTranscript(admin, { clientId: match.clientId, title: meetingTitle, meetingDate: date, content, source: 'google_docs', docId: file.id, docUrl: file.webViewLink, taskId: match.taskId, uploadedBy: { id: userId, name: uploaderName } })
    if (saved.status === 'created') result.created.push({ clientId: match.clientId, title: meetingTitle })
  }
  return result
}

const toUnmatched = (file: DriveTranscriptFile, title: string, meetingDate: string | null) => ({ docId: file.id, title, meetingDate, url: file.webViewLink })

/** Usuarios con Google Docs conectado, para la sincronización automática. */
export async function listUsersWithDocs(admin: Admin) {
  const { data } = await admin.from('plataformas_tokens').select('cliente_id').eq('plataforma', 'google_docs').eq('activo', true).not('cliente_id', 'is', null).limit(500)
  return [...new Set((data ?? []).map((row) => row.cliente_id as string))]
}
