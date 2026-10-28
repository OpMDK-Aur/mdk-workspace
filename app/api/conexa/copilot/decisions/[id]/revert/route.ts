import { NextResponse } from 'next/server'
import { copilotError, requireUser, type IdParams } from '@/lib/conexa/copilot/route-helpers'
import { revertDecision } from '@/lib/conexa/copilot/store'

export async function POST(_request: Request, { params }: IdParams) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  try {
    return NextResponse.json({ decision: await revertDecision(id) })
  } catch (cause) {
    return copilotError(cause)
  }
}
