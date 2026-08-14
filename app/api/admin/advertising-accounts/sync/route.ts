import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncAllAdvertisingAccounts } from '@/lib/ads/sync-all-accounts'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: collaborator } = await supabase.from('colaboradores').select('roles(nombre)').eq('email', user.email).single()
  const relation = collaborator?.roles as { nombre: string } | { nombre: string }[] | null
  const role = Array.isArray(relation) ? relation[0]?.nombre : relation?.nombre
  if (!['admin', 'administrador', 'master'].includes((role || '').trim().toLowerCase())) {
    return NextResponse.json({ error: 'Solo administradores pueden sincronizar cuentas.' }, { status: 403 })
  }

  try {
    return NextResponse.json(await syncAllAdvertisingAccounts())
  } catch (error) {
    console.error('[v0] Advertising accounts sync failed:', error)
    return NextResponse.json({ error: 'No se pudo sincronizar las cuentas publicitarias.' }, { status: 500 })
  }
}
