import { NextResponse, type NextRequest } from 'next/server'
import { loadSeguimiento } from '@/lib/tasks/seguimiento-match'
import { isDate, isUuid, requireUser } from '@/lib/tasks/seguimiento-auth'

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const usuarioId = request.nextUrl.searchParams.get('usuario_id')
  const semana = request.nextUrl.searchParams.get('semana')
  if (!isUuid(usuarioId) || !isDate(semana)) {
    return NextResponse.json({ error: 'usuario_id y semana son obligatorios' }, { status: 400 })
  }

  try {
    const payload = await loadSeguimiento(auth.db, usuarioId, semana, { runMatch: true })
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[seguimiento/match]', error)
    return NextResponse.json({ error: 'No se pudo correr el match' }, { status: 500 })
  }
}
