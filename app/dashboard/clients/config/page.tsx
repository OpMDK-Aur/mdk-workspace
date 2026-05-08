import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsPlatformConfig } from '@/components/dashboard/clients-platform-config'

export default async function ClientsConfigPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('rol_id')
    .eq('id', user.id)
    .single()

  // TODO: Check rol_id against roles table for direccion/project_manager
  if (!colaborador) {
    redirect('/dashboard')
  }

  const { data: clients } = await supabase
    .from('Clientes')
    .select('id, nombre_del_negocio, meta_ads_id, google_ads_id, crm_type, ghl_location_id, ghl_token, semaforo_id')
    .order('nombre_del_negocio')

  return <ClientsPlatformConfig clients={clients || []} />
}
