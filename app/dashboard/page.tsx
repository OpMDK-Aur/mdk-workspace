import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: colaborador } = user ? await supabase
    .from('colaboradores')
    .select('*, roles(id, nombre)')
    .eq('id', user.id)
    .single() : { data: null }

  // Map rol name to profile.role for compatibility
  const roleName = colaborador?.roles?.nombre?.toLowerCase().replace(/ /g, '_') || ''
  const profile = colaborador ? { ...colaborador, role: roleName } : null

  const isFullAccess = !profile || roleName === 'master' || roleName === 'administrador' || roleName === 'project_manager'

  let clients: any[] = []
  if (isFullAccess) {
    const { data } = await supabase.from('clientes').select('*').order('nombre_del_negocio')
    clients = (data || []).map(c => ({ ...c, business_name: c.nombre_del_negocio }))
  } else {
    const { data: access } = await supabase
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user?.id ?? '')
    const ids = access?.map((a: any) => a.client_id) || []
    if (ids.length > 0) {
      const { data } = await supabase.from('clientes').select('*').in('id', ids).order('nombre_del_negocio')
      clients = (data || []).map(c => ({ ...c, business_name: c.nombre_del_negocio }))
    }
  }

  return (
    <DashboardContent clients={clients} profile={profile} />
  )
}
