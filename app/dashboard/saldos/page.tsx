import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SaldosContent } from '@/components/dashboard/saldos-content'

export const metadata = {
  title: 'Control de saldos · MDK Workspace',
  description: 'Monitoreo de presupuesto publicitario por cliente y plataforma',
}

export default async function SaldosPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('colaboradores')
    .select('*, roles(id, nombre)')
    .eq('id', user.id)
    .maybeSingle()

  // Get role name from colaborador
  const roleName = profile?.roles?.nombre?.toLowerCase().replace(/ /g, '_') || ''
  const isFullAccess = roleName === 'master' || roleName === 'administrador' || roleName === 'project_manager' || roleName === 'account_manager'

  let clientsQuery = supabase
    .from('Clientes')
    .select('id, nombre_del_negocio, meta_ads_id, google_ads_id, semaforo_id')

  if (!isFullAccess) {
    const { data: access } = await supabase
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
    const ids = access?.map(a => a.client_id) ?? []
    clientsQuery = ids.length > 0
      ? clientsQuery.in('id', ids)
      : clientsQuery.in('id', ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: clientsData } = await clientsQuery.order('nombre_del_negocio')
  
  // Map to expected format
  const clients = (clientsData ?? []).map(c => ({
    id: c.id,
    business_name: c.nombre_del_negocio,
    meta_ads_account_id: c.meta_ads_id,
    google_ads_customer_id: c.google_ads_id,
    status: c.semaforo_id,
  }))

  return <SaldosContent clients={clients} />
}
