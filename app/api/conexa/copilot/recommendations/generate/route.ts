import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runGeneration } from '@/lib/conexa/copilot/generator'
import { copilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { assertClientAccess } from '@/lib/conexa/copilot/store'

export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const parsed = z.object({ clientId: z.string().uuid() }).safeParse(await readJson<{ clientId: string }>(request))
  if (!parsed.success) return NextResponse.json({ error: 'Falta el cliente.' }, { status: 400 })
  const { clientId } = parsed.data
  try {
    const client = await assertClientAccess(auth.supabase, clientId)
    const result = await runGeneration({ supabase: auth.supabase, user: auth.user, client: client as unknown as Record<string, unknown>, clientId, runMode: 'scan' })
    return NextResponse.json({ recommendations: result.createdRecommendations, reply: result.output.reply, questions: result.output.questions, skippedDuplicates: result.skippedDuplicates })
  } catch (error) { return copilotError(error) }
}
