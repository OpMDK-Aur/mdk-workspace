import { NextResponse, type NextRequest } from 'next/server'
import { isDate, isUuid, requireUser, sanitizeItemFields } from '@/lib/tasks/seguimiento-auth'

/** Lookup data for the page: collaborators, clients and the logged-in user's id. */
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const [colabs, clientes] = await Promise.all([
    auth.db.from('colaboradores').select('id, nombre, apellido, avatar_url, email').eq('activo', true).order('nombre'),
    auth.db.from('clientes').select('id, nombre_del_negocio').order('nombre_del_negocio'),
  ])

  const me = (colabs.data ?? []).find((c) => c.email?.toLowerCase() === auth.user.email?.toLowerCase())

  return NextResponse.json({
    currentUserId: me?.id ?? auth.user.id,
    colaboradores: (colabs.data ?? []).map(({ email: _email, ...c }) => c),
    clientes: clientes.data ?? [],
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || !isUuid(body.usuario_id) || !isDate(body.semana) || typeof body.titulo !== 'string') {
    return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
  }
  const fields = sanitizeItemFields({ grupo: 'semana', ...body })
  if (!fields) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { data, error } = await auth.db
    .from('seguimiento_items')
    .insert({
      ...fields,
      usuario_id: body.usuario_id,
      semana: body.semana,
      match_estado: fields.grupo === 'tarjetas' ? 'sin_match' : 'pendiente',
    })
    .select('*')
    .single()

  if (error) {
    console.error('[seguimiento POST]', error)
    return NextResponse.json({ error: 'No se pudo crear el ítem' }, { status: 500 })
  }
  return NextResponse.json(data)
}
