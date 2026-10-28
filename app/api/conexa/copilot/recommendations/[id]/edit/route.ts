import { NextResponse } from 'next/server'
import { copilotError, readJson, requireUser, type IdParams } from '@/lib/conexa/copilot/route-helpers'
import { editRecommendation } from '@/lib/conexa/copilot/store'

export async function POST(request: Request, { params }: IdParams) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const { after } = await readJson<{ after: string }>(request)
  if (typeof after !== 'string' || !after.trim() || after.length > 200) return NextResponse.json({ error: 'Valor propuesto inválido' }, { status: 400 })
  try {
    return NextResponse.json({ recommendation: editRecommendation(id, after) })
  } catch (cause) {
    return copilotError(cause)
  }
}
