import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsPlatformConfig } from '@/components/dashboard/clients-platform-config'

export default async function ClientsConfigPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'direccion' && profile?.role !== 'project_manager') {
    redirect('/dashboard')
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, business_name, meta_ads_account_id, google_ads_customer_id, crm_type, ghl_location_id, ghl_token, status')
    .order('business_name')

  return <ClientsPlatformConfig clients={clients || []} />
}
