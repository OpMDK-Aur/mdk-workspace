import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assessContext, profileUpdateSchema, readClientProfile, saveProfileUpdates } from '@/lib/conexa/copilot/client-profile'
import { copilotError, readJson, requireUser } from '@/lib/conexa/copilot/route-helpers'
import { assertClientAccess, listClientContext } from '@/lib/conexa/copilot/store'

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!clientId || !z.string().uuid().safeParse(clientId).success) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, clientId)
    const [profile, notes] = await Promise.all([readClientProfile(clientId), listClientContext(auth.supabase, clientId)])
    return NextResponse.json({ profile, assessment: assessContext(profile, notes) })
  } catch (error) { return copilotError(error) }
}

export async function PATCH(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const parsed = z.object({ clientId: z.string().uuid(), updates: z.array(profileUpdateSchema).min(1).max(10) }).safeParse(await readJson(request))
  if (!parsed.success) return NextResponse.json({ error: 'Los datos del contexto no son válidos.' }, { status: 400 })
  try {
    await assertClientAccess(auth.supabase, parsed.data.clientId)
    const [profile, notes] = await Promise.all([saveProfileUpdates(parsed.data.clientId, parsed.data.updates), listClientContext(auth.supabase, parsed.data.clientId)])
    return NextResponse.json({ profile, assessment: assessContext(profile, notes) })
  } catch (error) { return copilotError(error) }
}
