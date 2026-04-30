import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user ? await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', user.id)
    .single() : { data: null }

  const isFullAccess = !profile || profile?.role === 'direccion' || profile?.role === 'project_manager'

  let clients: any[] = []
  if (isFullAccess) {
    const { data } = await supabase.from('clients').select('*').order('business_name')
    clients = data || []
  } else {
    const { data: access } = await supabase
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user?.id ?? '')
    const ids = access?.map((a: any) => a.client_id) || []
    if (ids.length > 0) {
      const { data } = await supabase.from('clients').select('*').in('id', ids).order('business_name')
      clients = data || []
    }
  }

  return (
    <DashboardContent clients={clients} profile={profile} />
  )
}
