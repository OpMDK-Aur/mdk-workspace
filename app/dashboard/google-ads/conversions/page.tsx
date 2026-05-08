import { createClient } from '@/lib/supabase/server'
import { ConversionsPageClient } from '@/components/google-ads/conversions-page-client'

export const metadata = {
  title: 'Conversiones Google Ads | MDK Workspace',
  description: 'Visualiza las conversiones de Google Ads por cliente.',
}

export default async function ConversionsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch all clients (access already filtered by dashboard layout)
  const { data: clientAccess } = await supabase
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', user!.id)

  const clientIds = clientAccess?.map(ca => ca.client_id) ?? []

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('rol_id')
    .eq('id', user!.id)
    .maybeSingle()

  // TODO: Check rol_id for access control
  const isFullAccess = !!colaborador

  let query = supabase
    .from('clientes')
    .select('*')

  if (!isFullAccess && clientIds.length > 0) {
    query = query.in('id', clientIds)
  } else if (!isFullAccess) {
    query = query.in('id', ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: clientsData } = await query.order('nombre_del_negocio')
  
  // Map to expected format
  const clients = (clientsData ?? []).map((c: any) => ({
    id: c.id,
    business_name: c.nombre_del_negocio,
    google_ads_customer_id: c.google_ads_id || c.google_customer_id || null,
  }))

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <ConversionsPageClient clients={clients ?? []} />
    </main>
  )
}
