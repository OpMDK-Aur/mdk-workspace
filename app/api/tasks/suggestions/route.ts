import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/tasks/seguimiento-auth'

/** Seguimiento items with no matching task: Conexa suggests creating them. */
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { data: me } = await auth.db
    .from('colaboradores')
    .select('id')
    .ilike('email', auth.user.email ?? '')
    .maybeSingle()

  const { data, error } = await auth.db
    .from('seguimiento_items')
    .select('id, titulo, cliente_id, cliente_nombre, prioridad, fecha_vencimiento, detalles, grupo, created_at')
    .eq('usuario_id', me?.id ?? auth.user.id)
    .eq('match_estado', 'sin_match')
    .eq('completado', false)
    .is('tarea_id', null)
    .neq('grupo', 'tarjetas')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error('[suggestions GET]', error)
    return NextResponse.json({ error: 'No se pudieron cargar las sugerencias' }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [] })
}
