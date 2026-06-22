import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsPlatformConfig } from '@/components/dashboard/clients-platform-config'

export default async function PlatformPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('colaboradores')
    .select('rol_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/dashboard')
  }

  const { data: clientes } = await supabase
    .from('clientes')
    .select(`
      id, 
      nombre_del_negocio, 
      meta_ads_account_id, 
      google_ads_customer_id, 
      crm_type, 
      ghl_location_id, 
      ghl_token,
      project_manager_id,
      account_manager_id
    `)
    .order('nombre_del_negocio')

  // Fetch all colaboradores once to use as a map
  const { data: allColaboradores } = await supabase
    .from('colaboradores')
    .select('id, full_name')

  const managerMap = new Map(allColaboradores?.map(m => [m.id, m.full_name]) || [])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cuentas publicitarias</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configura los IDs de Meta Ads y Google Ads de cada cliente.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">IDs de clientes</h2>
        <ClientsPlatformConfig clients={(clientes || []).map(c => ({
          id: c.id,
          business_name: c.nombre_del_negocio || '',
          meta_ads_account_id: c.meta_ads_account_id,
          google_ads_customer_id: c.google_ads_customer_id,
          crm_type: c.crm_type,
          ghl_location_id: c.ghl_location_id,
          ghl_token: c.ghl_token,
          project_manager_id: c.project_manager_id,
          project_manager_name: c.project_manager_id ? managerMap.get(c.project_manager_id) : undefined,
          account_manager_id: c.account_manager_id,
          account_manager_name: c.account_manager_id ? managerMap.get(c.account_manager_id) : undefined,
        }))} />
      </div>
    </div>
  )
}
