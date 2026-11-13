import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runGeneration } from '@/lib/conexa/copilot/generator'
import { copilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { addClientContext, assertClientAccess, insertMessages, listMessages } from '@/lib/conexa/copilot/store'

export const maxDuration = 300

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, clientId)
    return NextResponse.json({ messages: await listMessages(auth.supabase, clientId, auth.user.id) })
  } catch (error) { return copilotError(error) }
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const body = await readJson<{ clientId: string; message: string; editingRecommendationId?: string }>(request)
  const parsed = z.object({ clientId: z.string().uuid(), message: z.string().trim().min(1).max(4000), editingRecommendationId: z.string().uuid().optional() }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'El mensaje o cliente no es válido.' }, { status: 400 })
  const { clientId, message, editingRecommendationId } = parsed.data

  try {
    const client = await assertClientAccess(auth.supabase, clientId)
    const userMessage = await insertMessages(auth.supabase, [{ client_id: clientId, user_id: auth.user.id, role: 'user', content: message }])
    const result = await runGeneration({ supabase: auth.supabase, user: auth.user, client: client as unknown as Record<string, unknown>, clientId, runMode: 'chat', message, editingRecommendationId })

    let contextSaved = 0
    for (const content of result.contextToSave) {
      await addClientContext(auth.supabase, { clientId, content, source: 'chat', userId: auth.user.id })
      contextSaved++
    }
    const reply = [result.output.reply, ...result.output.questions.map((question) => `• ${question}`)].join('\n')
    const [assistantMessage] = await insertMessages(auth.supabase, [{ client_id: clientId, user_id: auth.user.id, role: 'assistant', content: reply }])
    return NextResponse.json({ userMessage: userMessage[0], message: assistantMessage, recommendations: result.createdRecommendations, editedRecommendation: result.editedRecommendation, contextSaved, needsClarification: result.output.needsClarification })
  } catch (error) { return copilotError(error) }
}
