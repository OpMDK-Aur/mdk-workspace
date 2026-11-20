import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { CONNECTOR_BY_ID, isConnectorId } from '@/lib/connectors/catalog'

/** Desconecta la cuenta del usuario logueado para un conector. No toca las de otras personas. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isConnectorId(id)) return NextResponse.json({ error: 'Conector desconocido.' }, { status: 404 })
  const platform = CONNECTOR_BY_ID[id].platform
  if (!platform) return NextResponse.json({ error: 'Este conector no se puede desconectar desde acá.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { error } = await createAdminClient().from('plataformas_tokens').delete().eq('plataforma', platform).eq('cliente_id', user.id)
  if (error) return NextResponse.json({ error: 'No se pudo desconectar la cuenta.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
