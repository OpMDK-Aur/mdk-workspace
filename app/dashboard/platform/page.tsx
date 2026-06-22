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
      account_manager_id,
      colaboradores_project_manager: colaboradores!project_manager_id(full_name),
      colaboradores_account_manager: colaboradores!account_manager_id(full_name)
    `)
    .order('nombre_del_negocio')

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
          project_manager_name: c.colaboradores_project_manager?.full_name,
          account_manager_id: c.account_manager_id,
          account_manager_name: c.colaboradores_account_manager?.full_name,
        }))} />
      </div>
    </div>
  )
}
