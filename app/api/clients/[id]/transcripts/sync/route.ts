import { NextResponse } from 'next/server'
import { DriveAuthError } from '@/lib/transcripts/google-drive'
import { DocsNotConnectedError, syncUserTranscripts } from '@/lib/transcripts/service'
import { MISSING_TABLE_MESSAGE, requireClientAccess } from '@/lib/transcripts/route-access'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Sincroniza ahora las transcripciones del Drive de quien lo pide (últimos 30
 * días). Las que se reconocen se cargan en su cliente; las que no, se devuelven
 * para vincularlas a mano a este cliente.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireClientAccess(id)
  if ('error' in access) return access.error

  try {
    const result = await syncUserTranscripts(access.user.id, { sinceDays: 30 })
    return NextResponse.json({
      createdForClient: result.created.filter((item) => item.clientId === id).length,
      createdElsewhere: result.created.filter((item) => item.clientId !== id).length,
      alreadySynced: result.alreadySynced,
      unmatched: result.unmatched,
    })
  } catch (error) {
    if (error instanceof DocsNotConnectedError || error instanceof DriveAuthError) return NextResponse.json({ error: error.message, needsConnection: true }, { status: 409 })
    const message = error instanceof Error ? error.message : ''
    console.error('[transcripts] Error al sincronizar:', message)
    return NextResponse.json({ error: /relation|does not exist|PGRST205/i.test(message) ? MISSING_TABLE_MESSAGE : 'No se pudo sincronizar con Google Docs.' }, { status: 500 })
  }
}
