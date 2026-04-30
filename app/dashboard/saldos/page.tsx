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
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const isFullAccess = profile?.role === 'direccion' || profile?.role === 'project_manager'

  let clientsQuery = supabase
    .from('clients')
    .select('id, business_name, meta_ads_account_id, google_ads_customer_id, status')

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

  const { data: clients } = await clientsQuery.order('business_name')

  return <SaldosContent clients={clients ?? []} />
}
