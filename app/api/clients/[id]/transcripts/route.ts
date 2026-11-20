import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getUserGoogleDocsAccessToken } from '@/lib/google-tokens'
import { DriveAuthError, exportDocText, getDocMetadata } from '@/lib/transcripts/google-drive'
import { cleanTranscriptText, extractGoogleDocId, parseTranscriptDocName, transcriptExcerpt } from '@/lib/transcripts/parse'
import { collaboratorName, saveTranscript, TRANSCRIPTS_TABLE } from '@/lib/transcripts/service'
import { isMissingTableError, MISSING_TABLE_MESSAGE, requireClientAccess } from '@/lib/transcripts/route-access'

export const runtime = 'nodejs'

/** Lista las transcripciones del cliente (sin el texto completo). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireClientAccess(id)
  if ('error' in access) return access.error

  const admin = createAdminClient()
  const { data, error } = await admin
    .from(TRANSCRIPTS_TABLE)
    .select('id, titulo, fecha_reunion, fuente, google_doc_url, subido_por, created_at, contenido')
    .eq('cliente_id', id)
    .order('fecha_reunion', { ascending: false, nullsFirst: false })
    .limit(100)
  if (error) return NextResponse.json({ error: isMissingTableError(error) ? MISSING_TABLE_MESSAGE : 'No se pudieron leer las transcripciones.' }, { status: 500 })

  const uploaderIds = [...new Set((data ?? []).map((row) => row.subido_por).filter(Boolean))] as string[]
  const { data: people } = uploaderIds.length ? await admin.from('colaboradores').select('id, nombre, apellido').in('id', uploaderIds) : { data: [] }
  const names = new Map((people ?? []).map((person) => [person.id, [person.nombre, person.apellido].filter(Boolean).join(' ')]))

  return NextResponse.json({
    transcripts: (data ?? []).map(({ contenido, ...row }) => ({
      ...row,
      subido_por_nombre: row.subido_por ? names.get(row.subido_por) ?? null : null,
      extracto: transcriptExcerpt(contenido, 220),
      caracteres: contenido.length,
    })),
  })
}

const bodySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('doc'), doc: z.string().trim().min(1).max(500) }),
  z.object({
    mode: z.literal('manual'),
    title: z.string().trim().min(1, 'Poné un título.').max(300),
    meetingDate: z.string().datetime({ offset: true }).nullable().optional(),
    content: z.string().min(20, 'La transcripción está vacía o es muy corta.').max(400_000),
  }),
])

/** Vincula un Google Doc (por link) o carga una transcripción a mano en este cliente. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireClientAccess(id)
  if ('error' in access) return access.error

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 })

  const admin = createAdminClient()
  const uploadedBy = { id: access.user.id, name: await collaboratorName(admin, access.user.id) }

  try {
    if (parsed.data.mode === 'manual') {
      const content = cleanTranscriptText(parsed.data.content)
      const saved = await saveTranscript(admin, { clientId: id, title: parsed.data.title, meetingDate: parsed.data.meetingDate ?? null, content, source: 'manual', uploadedBy })
      return NextResponse.json(saved, { status: 201 })
    }

    const docId = extractGoogleDocId(parsed.data.doc)
    if (!docId) return NextResponse.json({ error: 'Pegá el link de un documento de Google Docs.' }, { status: 400 })
    const accessToken = await getUserGoogleDocsAccessToken(access.user.id)
    if (!accessToken) return NextResponse.json({ error: 'Conectá Google Docs en Conectores para vincular documentos.', needsConnection: true }, { status: 409 })
    const file = await getDocMetadata(accessToken, docId)
    if (!file) return NextResponse.json({ error: 'No encontramos ese documento en tu cuenta de Google, o no es un Google Doc.' }, { status: 404 })
    const content = await exportDocText(accessToken, docId)
    if (!content) return NextResponse.json({ error: 'El documento está vacío.' }, { status: 422 })
    const { meetingTitle, meetingDate } = parseTranscriptDocName(file.name)
    const saved = await saveTranscript(admin, { clientId: id, title: meetingTitle, meetingDate: meetingDate ?? file.createdTime, content, source: 'google_docs', docId, docUrl: file.webViewLink, uploadedBy })
    return NextResponse.json(saved, { status: saved.status === 'created' ? 201 : 200 })
  } catch (error) {
    if (error instanceof DriveAuthError) return NextResponse.json({ error: error.message, needsConnection: true }, { status: 409 })
    const message = error instanceof Error ? error.message : ''
    console.error('[transcripts] Error al guardar:', message)
    return NextResponse.json({ error: /relation|does not exist|PGRST205/i.test(message) ? MISSING_TABLE_MESSAGE : 'No se pudo guardar la transcripción.' }, { status: 500 })
  }
}
