import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { MetaPublishError } from './publish'
import { listPromotablePages, matchPageByName } from './pages'

type ClientRow = {
  nombre_del_negocio: string | null
  meta_page_id: string | null
  meta_ads_account_id: string | null
  meta_ads_account_ids: string[] | null
  cuentas_publicitarias: Array<{ id_cuenta: string | null; plataforma: string | null; activo: boolean | null }> | null
}

const normalize = (value: string) => value.replace(/^act_/, '').trim()

export async function resolveBulkClient(clientId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (!clientId) return { error: NextResponse.json({ error: 'Falta el cliente' }, { status: 400 }) }

  const { data } = await supabase
    .from('clientes')
    .select('nombre_del_negocio, meta_page_id, meta_ads_account_id, meta_ads_account_ids, cuentas_publicitarias(id_cuenta, plataforma, activo)')
    .eq('id', clientId)
    .maybeSingle<ClientRow>()
  if (!data) return { error: NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 }) }

  const accountIds = new Set([
    ...(data.meta_ads_account_ids ?? []),
    ...(data.meta_ads_account_id ? [data.meta_ads_account_id] : []),
    ...(data.cuentas_publicitarias ?? []).filter((item) => item.plataforma === 'meta' && item.activo !== false && item.id_cuenta).map((item) => item.id_cuenta as string),
  ].flatMap((value) => String(value).split(',')).map(normalize).filter(Boolean))

  const pageId = data.meta_page_id || (await autoResolvePage(clientId, data.nombre_del_negocio ?? '', [...accountIds]))
  return { pageId, accountIds }
}

/**
 * When the client has no page saved, use the pages its ad accounts can promote.
 * A single promotable page, or a single name match among them, is saved so it only resolves once.
 */
async function autoResolvePage(clientId: string, clientName: string, accountIds: string[]) {
  const pages = await listPromotablePages(accountIds)
  const page = pages.length === 1 ? pages[0] : matchPageByName(clientName, pages)
  if (!page) return null
  await createAdminClient().from('clientes').update({ meta_page_id: page.id }).eq('id', clientId).is('meta_page_id', null)
  return page.id
}

export function isAllowedAssetUrl(url: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return Boolean(base) && url.startsWith(`${base}/storage/v1/object/public/`)
}

export function publishErrorResponse(cause: unknown) {
  if (cause instanceof MetaPublishError) return NextResponse.json({ error: cause.message, step: cause.step }, { status: 400 })
  console.error('[bulk-publish] unexpected error', cause)
  return NextResponse.json({ error: 'No se pudo completar la publicación en Meta.' }, { status: 500 })
}

export const normalizeAccountId = normalize
