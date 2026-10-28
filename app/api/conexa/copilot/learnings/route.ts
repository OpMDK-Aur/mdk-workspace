import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/conexa/copilot/route-helpers'
import { listLearnings } from '@/lib/conexa/copilot/store'

export async function GET(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const clientId = new URL(request.url).searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  return NextResponse.json(listLearnings(clientId))
}
