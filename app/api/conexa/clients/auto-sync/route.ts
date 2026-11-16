import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { findAccountsByClientName } from '@/lib/conexa/auto-sync'

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Vincula automáticamente las cuentas que coinciden con el nombre del cliente.
 * Solo actúa sobre clientes sin ninguna plataforma conectada, así nunca pisa
 * una configuración hecha a mano.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: colaborador } = await supabase.from('colaboradores').select('rol_id').eq('id', user.id).maybeSingle()
  if (!colaborador) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { clientId?: string }
  if (!body.clientId || !UUID.test(body.clientId)) return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })

  const admin = createAdminClient()
  const [{ data: client }, { data: existingAccounts }] = await Promise.all([
    admin.from('clientes').select('id, nombre_del_negocio, meta_ads_account_id, google_ads_customer_id, analytics_property_id, tag_manager_container_id').eq('id', body.clientId).maybeSingle(),
    admin.from('cuentas_publicitarias').select('id').eq('cliente_id', body.clientId).eq('activo', true).limit(1),
  ])
  if (!client) return NextResponse.json({ error: 'No se encontró el cliente.' }, { status: 404 })
  if (client.meta_ads_account_id || client.google_ads_customer_id || client.analytics_property_id || client.tag_manager_container_id || existingAccounts?.length) {
    return NextResponse.json({ error: 'El cliente ya tiene cuentas conectadas. Revisalas en Conexiones.' }, { status: 409 })
  }

  const matches = await findAccountsByClientName(client.nombre_del_negocio ?? '')
  const total = matches.meta.length + matches.google.length + matches.analytics.length + matches.tagManager.length
  if (!total) return NextResponse.json({ found: false, linked: matches, errors: matches.errors })

  const { error: updateError } = await admin.from('clientes').update({
    updated_at: new Date().toISOString(),
    ...(matches.meta.length ? { meta_ads_account_id: matches.meta.map((account) => account.id).join(',') } : {}),
    ...(matches.google.length ? { google_ads_customer_id: matches.google.map((account) => account.id).join(',') } : {}),
    ...(matches.analytics.length ? { analytics_property_id: matches.analytics[0].id } : {}),
    ...(matches.tagManager.length ? { tag_manager_container_id: matches.tagManager.map((container) => container.id).join(',') } : {}),
  }).eq('id', client.id)
  if (updateError) return NextResponse.json({ error: 'No se pudieron guardar las cuentas encontradas.' }, { status: 500 })

  const rows = [
    ...matches.meta.map((account) => ({ plataforma: 'meta', id_cuenta: account.id, nombre_cuenta: account.name })),
    ...matches.google.map((account) => ({ plataforma: 'google', id_cuenta: account.id, nombre_cuenta: account.name })),
  ]
  if (rows.length) {
    const { error: insertError } = await admin.from('cuentas_publicitarias').insert(rows.map((row) => ({ ...row, cliente_id: client.id, activo: true })))
    if (insertError) return NextResponse.json({ error: 'Se guardaron las plataformas, pero no el detalle de cuentas publicitarias.' }, { status: 500 })
  }

  return NextResponse.json({ found: true, linked: { ...matches, analytics: matches.analytics.slice(0, 1) }, errors: matches.errors })
}
