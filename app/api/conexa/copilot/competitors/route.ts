import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assessContext, parseCompetitorNote, readClientProfile } from '@/lib/conexa/copilot/client-profile'
import { suggestCompetitors } from '@/lib/conexa/copilot/competitors'
import { COMPETITOR_PREFIX, DISCARDED_COMPETITOR_PREFIX, SUGGESTED_COMPETITOR_MARK } from '@/lib/conexa/copilot/profile-fields'
import { CopilotError, copilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { addClientContext, assertClientAccess, listClientContext, rewriteClientContext } from '@/lib/conexa/copilot/store'

export const maxDuration = 60

const nameSchema = z.string().trim().min(2).max(80).transform((value) => value.replace(/[:\n·]/g, ' ').replace(/\s+/g, ' ').trim())
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suggest'), clientId: z.string().uuid(), onlyIfEmpty: z.boolean().optional() }),
  z.object({ action: z.literal('add'), clientId: z.string().uuid(), name: nameSchema, detail: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('remove'), clientId: z.string().uuid(), noteId: z.string().uuid() }),
  z.object({ action: z.literal('set'), clientId: z.string().uuid(), names: z.array(nameSchema).max(12) }),
])
const same = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const parsed = input.safeParse(await readJson(request))
  if (!parsed.success) return NextResponse.json({ error: 'Los datos del competidor no son válidos.' }, { status: 400 })
  const body = parsed.data
  try {
    const client = await assertClientAccess(auth.supabase, body.clientId)
    const [profile, notes] = await Promise.all([readClientProfile(body.clientId), listClientContext(auth.supabase, body.clientId)])
    const current = assessContext(profile, notes)
    let suggested = 0

    if (body.action === 'suggest') {
      if (body.onlyIfEmpty && !current.autoSuggestCompetitors) return NextResponse.json({ profile, assessment: current, suggested })
      if (current.level === 'debil') throw new CopilotError('Completá industria, objetivo comercial y qué vende antes de buscar competidores.', 412)
      const suggestions = await suggestCompetitors({
        clientName: String((client as { nombre_del_negocio?: string }).nombre_del_negocio ?? 'el cliente'),
        industry: typeof profile?.industry === 'string' ? profile.industry : null,
        product: typeof profile?.product_type === 'string' ? profile.product_type : null,
        objective: typeof profile?.commercial_objective === 'string' ? profile.commercial_objective : null,
        exclude: [...current.competitors, ...current.discardedCompetitors],
      })
      for (const item of suggestions) await addClientContext(auth.supabase, { clientId: body.clientId, content: `${COMPETITOR_PREFIX}${item.name}: ${SUGGESTED_COMPETITOR_MARK} — ${item.reason}`, source: 'chat', userId: auth.user.id })
      suggested = suggestions.length
    }
    if (body.action === 'add') {
      if (current.competitors.some((name) => same(name, body.name))) throw new CopilotError(`«${body.name}» ya está en la lista de competidores.`, 409)
      await addClientContext(auth.supabase, { clientId: body.clientId, content: `${COMPETITOR_PREFIX}${body.name}${body.detail ? `: ${body.detail}` : ''}`, source: 'manual', userId: auth.user.id })
    }
    if (body.action === 'set') {
      const names = body.names.filter((name, index) => name.length >= 2 && body.names.findIndex((other) => same(other, name)) === index)
      for (const entry of current.competitorEntries) if (!names.some((name) => same(name, entry.name))) await rewriteClientContext(body.clientId, entry.noteId, `${DISCARDED_COMPETITOR_PREFIX}${entry.name}`)
      for (const name of names) if (!current.competitorEntries.some((entry) => same(entry.name, name))) await addClientContext(auth.supabase, { clientId: body.clientId, content: `${COMPETITOR_PREFIX}${name}`, source: 'manual', userId: auth.user.id })
    }
    if (body.action === 'remove') {
      const note = notes.find((item) => item.id === body.noteId)
      const competitor = note ? parseCompetitorNote(note.content) : null
      if (!competitor) throw new CopilotError('Ese competidor ya no está en la lista.', 404)
      await rewriteClientContext(body.clientId, body.noteId, `${DISCARDED_COMPETITOR_PREFIX}${competitor.name}`)
    }

    const refreshed = await listClientContext(auth.supabase, body.clientId)
    return NextResponse.json({ profile, assessment: assessContext(profile, refreshed), suggested })
  } catch (error) { return copilotError(error) }
}
