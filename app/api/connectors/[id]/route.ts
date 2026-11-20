import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { CONNECTOR_BY_ID, CREDENTIALS_UNVERIFIED_SCOPE, CREDENTIALS_VERIFIED_SCOPE, isConnectorId } from '@/lib/connectors/catalog'
import { encryptCredentials, MissingEncryptionKeyError } from '@/lib/connectors/secrets'
import { verifyConnectorCredentials } from '@/lib/connectors/verify'

async function sessionUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Guarda las credenciales del usuario logueado para un conector, después de probarlas contra el proveedor. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isConnectorId(id)) return NextResponse.json({ error: 'Conector desconocido.' }, { status: 404 })
  const connector = CONNECTOR_BY_ID[id]
  if (connector.kind !== 'credentials' || !connector.fields || !connector.platform) return NextResponse.json({ error: 'Este conector se conecta con su login.' }, { status: 400 })

  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const schema = z.object(Object.fromEntries(connector.fields.map((field) => {
    const base = z.string().trim().max(2000)
    return [field.name, field.optional ? base.optional().default('') : base.min(1, `Completá ${field.label}.`)]
  })))
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 })

  const result = await verifyConnectorCredentials(id, parsed.data as Record<string, string>)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

  let encrypted: string
  try {
    encrypted = encryptCredentials(result.values)
  } catch (error) {
    if (error instanceof MissingEncryptionKeyError) return NextResponse.json({ error: 'Las credenciales son válidas, pero falta configurar el cifrado en el servidor (CONNECTORS_ENCRYPTION_KEY).' }, { status: 503 })
    throw error
  }

  const admin = createAdminClient()
  await admin.from('plataformas_tokens').delete().eq('plataforma', connector.platform).eq('cliente_id', user.id)
  const now = new Date().toISOString()
  const { error } = await admin.from('plataformas_tokens').insert({
    cliente_id: user.id,
    plataforma: connector.platform,
    nombre_cuenta: connector.name,
    access_token: encrypted,
    refresh_token: null,
    token_expiry: null,
    email_conectado: result.label,
    scope: connector.verifies ? CREDENTIALS_VERIFIED_SCOPE : CREDENTIALS_UNVERIFIED_SCOPE,
    activo: true,
    created_at: now,
    updated_at: now,
  })
  if (error) {
    console.error('[connectors] No se pudo guardar la conexión:', error.message)
    return NextResponse.json({ error: 'No se pudo guardar la conexión.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, label: result.label, verified: Boolean(connector.verifies) })
}

/** Desconecta la cuenta del usuario logueado para un conector. No toca las de otras personas. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isConnectorId(id)) return NextResponse.json({ error: 'Conector desconocido.' }, { status: 404 })
  const platform = CONNECTOR_BY_ID[id].platform
  if (!platform) return NextResponse.json({ error: 'Este conector no se puede desconectar desde acá.' }, { status: 400 })

  const user = await sessionUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { error } = await createAdminClient().from('plataformas_tokens').delete().eq('plataforma', platform).eq('cliente_id', user.id)
  if (error) return NextResponse.json({ error: 'No se pudo desconectar la cuenta.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
