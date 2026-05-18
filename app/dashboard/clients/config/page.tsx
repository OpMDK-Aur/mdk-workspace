import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsPlatformConfig } from '@/components/dashboard/clients-platform-config'

const MASTER_ROL_ID = '9c585cac-f311-4c7a-83d5-23d3c714db6a'

export default async function ClientsConfigPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('rol_id')
    .eq('user_id', user.id)
    .single()

  // TODO: Check rol_id against roles table for direccion/project_manager
  if (!colaborador) {
    redirect('/dashboard')
  }

  const isMaster = colaborador.rol_id === MASTER_ROL_ID

  const { data: clients } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre_del_negocio')

  return <ClientsPlatformConfig clients={clients || []} isMaster={isMaster} />
}
