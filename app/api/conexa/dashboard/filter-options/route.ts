import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { dateRange } from '@/lib/conexa/period-range'
import { getMetaDeliveryRegions, getMetaPageAdsets } from '@/lib/meta-ads/service'

export const maxDuration = 60

const splitIds = (value: string | null) => String(value ?? '').split(',').map((id) => id.trim()).filter(Boolean)
const metaKey = (id: string) => id.replace(/^act_/, '')

/** Opciones para los filtros del tablero: cuentas publicitarias, fanpages y ubicaciones con entrega en el período. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { clientId?: string; period?: string; customRange?: { from?: string; to?: string } }
  if (!body.clientId) return NextResponse.json({ error: 'Falta el cliente seleccionado.' }, { status: 400 })
  const range = dateRange(body.period ?? 'Últimos 30 días', body.customRange)

  const { data: rows } = await createAdminClient().from('cuentas_publicitarias').select('id_cuenta, nombre_cuenta, plataforma').eq('cliente_id', body.clientId).eq('activo', true).in('plataforma', ['meta', 'google'])
  const seen = new Set<string>()
  const accounts = (rows ?? []).flatMap((row) => splitIds(row.id_cuenta).map((id) => {
    const platform = row.plataforma === 'meta' ? 'meta' : 'google'
    const cleanId = platform === 'meta' ? metaKey(id) : id.replace(/-/g, '')
    return { platform, id: cleanId, name: row.nombre_cuenta?.trim() || cleanId }
  })).filter((account) => { const key = `${account.platform}:${account.id}`; if (seen.has(key)) return false; seen.add(key); return true })

  const metaAccounts = accounts.filter((account) => account.platform === 'meta').slice(0, 10)
  const [pageResults, regionResults] = await Promise.all([
    Promise.all(metaAccounts.map((account) => getMetaPageAdsets(account.id).catch(() => ({ pages: [] as Array<{ id: string; name: string }> })))),
    Promise.all(metaAccounts.map((account) => getMetaDeliveryRegions(account.id, range.dateFrom, range.dateTo).catch(() => [] as string[]))),
  ])
  const pages = [...new Map(pageResults.flatMap((result) => result.pages).map((page) => [page.id, page])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const regions = [...new Set(regionResults.flat())]

  return NextResponse.json({ accounts, pages, regions, range })
}
