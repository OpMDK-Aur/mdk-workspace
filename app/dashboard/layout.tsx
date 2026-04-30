import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login')
  }

  // Get user colaborador — use maybeSingle to avoid error if RLS blocks
  const { data: profile, error: profileError } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // If profile is null (RLS blocked read), do NOT redirect to onboarding
  // onboarding_completado must be explicitly FALSE to trigger the redirect
  if (profile !== null && profile?.onboarding_completado === false) {
    redirect('/onboarding')
  }

  // Get clients the user has access to
  const { data: clientAccess } = await supabase
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', user.id)

  const clientIds = clientAccess?.map(ca => ca.client_id) || []

  // direccion and project_manager see all clients; others see only assigned clients
  const isFullAccess = profile?.role === 'direccion' || profile?.role === 'project_manager'
  let clientsQuery = supabase.from('clients').select('*')

  if (!isFullAccess && clientIds.length > 0) {
    clientsQuery = clientsQuery.in('id', clientIds)
  } else if (!isFullAccess && clientIds.length === 0) {
    // No access at all for other roles with no assignments
    clientsQuery = clientsQuery.in('id', ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: clients } = await clientsQuery.order('business_name')

  return (
    <DashboardShell 
      user={user} 
      profile={profile} 
      clients={clients || []}
    >
      {children}
    </DashboardShell>
  )
}
