import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { TRANSCRIPTS_TABLE } from '@/lib/transcripts/service'
import { requireClientAccess } from '@/lib/transcripts/route-access'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string; transcriptId: string }> }

/** Texto completo de una transcripción del cliente. */
export async function GET(_request: Request, { params }: Params) {
  const { id, transcriptId } = await params
  const access = await requireClientAccess(id)
  if ('error' in access) return access.error

  const { data } = await createAdminClient().from(TRANSCRIPTS_TABLE).select('id, titulo, fecha_reunion, contenido, google_doc_url, fuente').eq('id', transcriptId).eq('cliente_id', id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'La transcripción no existe.' }, { status: 404 })
  return NextResponse.json({ transcript: data })
}

/** Borra la transcripción y su comentario. Solo quien la cargó. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id, transcriptId } = await params
  const access = await requireClientAccess(id)
  if ('error' in access) return access.error

  const admin = createAdminClient()
  const { data } = await admin.from(TRANSCRIPTS_TABLE).select('id, subido_por, comentario_id').eq('id', transcriptId).eq('cliente_id', id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'La transcripción no existe.' }, { status: 404 })
  if (data.subido_por !== access.user.id) return NextResponse.json({ error: 'Solo quien cargó la transcripción puede borrarla.' }, { status: 403 })

  const { error } = await admin.from(TRANSCRIPTS_TABLE).delete().eq('id', transcriptId).eq('cliente_id', id)
  if (error) return NextResponse.json({ error: 'No se pudo borrar la transcripción.' }, { status: 500 })
  if (data.comentario_id) await admin.from('comentarios_clientes').delete().eq('id', data.comentario_id).eq('cliente_id', id)
  return NextResponse.json({ ok: true })
}
