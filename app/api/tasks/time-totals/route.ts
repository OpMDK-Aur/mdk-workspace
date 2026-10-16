import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/tasks/seguimiento-auth'

export type TaskTimeTotals = Record<string, { total: number; mine: number }>

const PAGE_SIZE = 1000
const MAX_PAGES = 20

/**
 * Tracked time per task, from entradas_de_tiempo rows linked by tarea_id.
 * Returns only aggregates: total seconds across everyone and seconds for the signed-in collaborator.
 */
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return auth.error

  const { data: me } = await auth.db
    .from('colaboradores')
    .select('id')
    .ilike('email', auth.user.email ?? '')
    .maybeSingle()
  const myId = me?.id ?? null

  const totals: TaskTimeTotals = {}
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await auth.db
      .from('entradas_de_tiempo')
      .select('tarea_id, colaborador_id, duracion_seg')
      .not('tarea_id', 'is', null)
      .not('duracion_seg', 'is', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      console.error('[time-totals GET]', error)
      return NextResponse.json({ error: 'No se pudo calcular el tiempo' }, { status: 500 })
    }

    for (const row of data ?? []) {
      const id = row.tarea_id as string
      const sec = Number(row.duracion_seg) || 0
      const bucket = (totals[id] ??= { total: 0, mine: 0 })
      bucket.total += sec
      if (myId && row.colaborador_id === myId) bucket.mine += sec
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  return NextResponse.json({ totals }, { headers: { 'Cache-Control': 'private, no-store' } })
}
