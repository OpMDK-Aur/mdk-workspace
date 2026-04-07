import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserManagementContent } from '@/components/dashboard/user-management-content'

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Only direccion and project_manager can access
  if (profile?.role !== 'direccion' && profile?.role !== 'project_manager') {
    redirect('/dashboard')
  }

  // Get all users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')

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
      currentUserRole={profile?.role || 'consultor'}
      profiles={profiles || []}
      clients={clients || []}
      userClientAccess={userClientAccess || []}
    />
  )
}
