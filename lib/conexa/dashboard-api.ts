import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { requireUser } from '@/lib/tasks/subtasks-api'

const unauthorized = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 })

export async function requireDashboardUser(request?: Request) {
  const authorization = request?.headers.get('authorization')
  let supabase: SupabaseClient
  let user: User | null

  if (authorization) {
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return { supabase: null, user: null, error: unauthorized() }
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { accessToken: async () => token },
    )
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return { supabase, user: null, error: unauthorized() }
    user = data.user
  } else {
    const auth = await requireUser()
    if (auth.error || !auth.user) return { ...auth, error: auth.error ?? unauthorized() }
    supabase = auth.supabase
    user = auth.user
  }

  const { data: member, error } = await supabase.from('colaboradores').select('id').eq('id', user.id).maybeSingle()
  if (error) return { supabase, user, error: NextResponse.json({ error: 'No se pudo validar el acceso de MDK.' }, { status: 500 }) }
  if (!member) return { supabase, user, error: NextResponse.json({ error: 'Esta función es exclusiva para usuarios de MDK.' }, { status: 403 }) }
  return { supabase, user, error: null }
}

export async function canAccessClient(supabase: SupabaseClient, clientId: string) {
  const { data } = await supabase.from('clientes').select('id').eq('id', clientId).maybeSingle()
  return Boolean(data)
}

export async function canAccessDashboard(supabase: SupabaseClient, clientId: string, dashboardId: string) {
  const { data } = await supabase.from('dashboards').select('id').eq('id', dashboardId).eq('client_id', clientId).eq('is_default', false).maybeSingle()
  return Boolean(data)
}
