import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/tasks/subtasks-api'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function requireDashboardUser() {
  const auth = await requireUser()
  if (auth.error || !auth.user) return { ...auth, error: auth.error ?? NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { data: member, error } = await auth.supabase.from('colaboradores').select('id').eq('id', auth.user.id).maybeSingle()
  if (error) return { ...auth, error: NextResponse.json({ error: 'No se pudo validar el acceso de MDK.' }, { status: 500 }) }
  if (!member) return { ...auth, error: NextResponse.json({ error: 'Esta función es exclusiva para usuarios de MDK.' }, { status: 403 }) }
  return { ...auth, error: null }
}

export async function canAccessClient(supabase: SupabaseClient, clientId: string) {
  const { data } = await supabase.from('clientes').select('id').eq('id', clientId).maybeSingle()
  return Boolean(data)
}

export async function canAccessDashboard(supabase: SupabaseClient, clientId: string, dashboardId: string) {
  const { data } = await supabase.from('dashboards').select('id').eq('id', dashboardId).eq('client_id', clientId).eq('is_default', false).maybeSingle()
  return Boolean(data)
}
