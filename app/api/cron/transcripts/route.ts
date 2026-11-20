import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { listUsersWithDocs, syncUserTranscripts } from '@/lib/transcripts/service'

export const runtime = 'nodejs'
export const maxDuration = 300

const TIME_BUDGET_MS = 270_000

/**
 * Cada 30 minutos trae las transcripciones nuevas de todas las personas que
 * conectaron Google Docs y las carga como comentario en su cliente.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const startedAt = Date.now()
  const admin = createAdminClient()
  const users = await listUsersWithDocs(admin)
  const summary = { users: users.length, processed: 0, created: 0, unmatched: 0, failed: 0 }

  for (const userId of users) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break
    try {
      const result = await syncUserTranscripts(userId, { sinceDays: 2, admin })
      summary.created += result.created.length
      summary.unmatched += result.unmatched.length
    } catch (error) {
      summary.failed += 1
      console.error('[cron/transcripts] Falló la sincronización de un usuario:', error instanceof Error ? error.message : error)
    }
    summary.processed += 1
  }
  return NextResponse.json(summary)
}
