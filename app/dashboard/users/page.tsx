import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserManagementContent } from '@/components/dashboard/user-management-content'

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', user.id)
    .single()

  // TODO: Check rol_id for access control
  if (!colaborador) {
    redirect('/dashboard')
  }

  // Get all colaboradores
  const { data: profiles } = await supabase
    .from('colaboradores')
    .select('*')
    .order('nombre')

  // Get all clients
  const { data: clients } = await supabase
    .from('clients')
    .select('id, business_name, status')
    .order('business_name')

  // Get all user-client access records
  const { data: userClientAccess } = await supabase
    .from('user_client_access')
    .select('*')

  return (
    <UserManagementContent
      currentUserId={user.id}
      currentUserRole={'colaborador'}
      profiles={profiles || []}
      clients={clients || []}
      userClientAccess={userClientAccess || []}
    />
  )
}
