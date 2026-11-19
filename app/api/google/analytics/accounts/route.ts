import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_ANALYTICS_PLATFORM, getSourcesForUser, listProperties, type AnalyticsProperty } from '@/lib/google-analytics/auth'

export const dynamic = 'force-dynamic'

type PropertyWithSource = AnalyticsProperty & { source: string }

/** Propiedades GA4 de la cuenta de operaciones más las de la cuenta que conectó el usuario. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { shared, own } = await getSourcesForUser(user.id)
    const byId = new Map<string, PropertyWithSource>()
    const errors: string[] = []
    for (const source of [...(shared ? [shared] : []), ...own]) {
      try {
        for (const property of await listProperties(source)) {
          if (!byId.has(property.propertyId)) byId.set(property.propertyId, { ...property, source: source.email ?? 'Cuenta conectada' })
        }
      } catch (error) {
        errors.push(`${source.email ?? 'Cuenta conectada'}: ${error instanceof Error ? error.message : 'error desconocido'}`)
      }
    }
    return NextResponse.json(
      { accounts: [...byId.values()], connection: own[0] ? { email: own[0].email } : null, errors },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar propiedades de Analytics' }, { status: 500 })
  }
}

/** Desconecta la cuenta de Analytics del usuario. Las propiedades ya asignadas a clientes no se tocan. */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { error } = await createAdminClient().from('plataformas_tokens').delete().eq('plataforma', GOOGLE_ANALYTICS_PLATFORM).eq('cliente_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
