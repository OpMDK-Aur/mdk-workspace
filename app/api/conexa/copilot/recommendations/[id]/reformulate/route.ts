import { NextResponse } from 'next/server'
import { copilotError, readJson, requireUser, type IdParams } from '@/lib/conexa/copilot/route-helpers'
import { reformulateRecommendation } from '@/lib/conexa/copilot/store'

export async function POST(request: Request, { params }: IdParams) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const { instruction } = await readJson<{ instruction: string }>(request)
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 500) return NextResponse.json({ error: 'Instrucción inválida' }, { status: 400 })
  try {
    return NextResponse.json({ recommendation: reformulateRecommendation(id, instruction) })
  } catch (cause) {
    return copilotError(cause)
  }
}
