import { NextResponse } from 'next/server'
import { requireDashboardUser } from '@/lib/conexa/dashboard-api'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { ejecutarAlertas } from '@/lib/controller/run-alerts'
import { myClientsFilter, resolveColaborador } from '@/lib/conexa/inicio-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MARGEN_MS = 10_000

/** Evalúa ahora las alertas del Controller de los clientes de quien tiene la sesión. */
export async function POST(request: Request) {
  const { user, error } = await requireDashboardUser(request)
  if (error) return error
  if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const admin = createAdminClient()
  const { id: me } = await resolveColaborador(admin, user)
  const { data: clientes, error: clientsError } = await admin.from('clientes').select('id, activo').or(myClientsFilter(me)).limit(300)
  if (clientsError) {
    console.error('[conexa/inicio/alertas] No se pudieron leer los clientes:', clientsError.message)
    return NextResponse.json({ error: 'No se pudieron leer tus clientes.' }, { status: 500 })
  }

  try {
    const resumen = await ejecutarAlertas(admin, {
      clienteIds: (clientes ?? []).filter((row) => row.activo !== false).map((row) => String(row.id)),
      deadline: Date.now() + maxDuration * 1000 - MARGEN_MS,
    })
    return NextResponse.json({ resumen })
  } catch (err) {
    console.error('[conexa/inicio/alertas] Error evaluando alertas:', err)
    return NextResponse.json({ error: 'No se pudieron revisar las alertas.' }, { status: 500 })
  }
}
