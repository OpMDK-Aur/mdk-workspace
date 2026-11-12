import { NextResponse } from 'next/server'
import { z } from 'zod'
import { copilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { addClientContext, assertClientAccess, listClientContext } from '@/lib/conexa/copilot/store'

const contextInput = z.object({ clientId: z.string().uuid(), content: z.string().trim().min(3).max(2000) })

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, clientId)
    return NextResponse.json({ context: await listClientContext(auth.supabase, clientId) })
  } catch (error) { return copilotError(error) }
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const parsed = contextInput.safeParse(await readJson(request))
  if (!parsed.success) return NextResponse.json({ error: 'El contexto debe tener entre 3 y 2000 caracteres.' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, parsed.data.clientId)
    const context = await addClientContext(auth.supabase, { clientId: parsed.data.clientId, content: parsed.data.content, source: 'manual', userId: auth.user.id })
    return NextResponse.json({ context }, { status: 201 })
  } catch (error) { return copilotError(error) }
}
