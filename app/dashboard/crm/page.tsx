import { createClient } from '@/lib/supabase/server'
import { CRMContent } from '@/components/dashboard/crm-content'

export default async function CRMPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user ? await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', user.id)
    .single() : { data: null }

  const isFullAccess = !profile || profile?.role === 'direccion' || profile?.role === 'project_manager'

  // Load all clients
  const { data: allClients } = await supabase.from('Clientes').select('*').order('nombre_del_negocio')
  const clients = allClients || []

  // Filter only clients with GHL configured (crm_type = 'ghl' and has ghl_location_id)
  const ghlClients = clients.filter(c => c.crm_type === 'ghl' && c.ghl_location_id)

  return (
    <CRMContent clients={ghlClients} allClients={clients} profile={profile} />
  )
}
