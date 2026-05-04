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

  // Get user colaborador with role name and department — use maybeSingle to avoid error if RLS blocks
  const { data: colaborador, error: profileError } = await supabase
    .from('colaboradores')
    .select('*, roles(id, nombre), departamentos(id, nombre)')
    .eq('id', user.id)
    .maybeSingle()

  // Map rol name to profile.role for compatibility
  const roleName = colaborador?.roles?.nombre?.toLowerCase().replace(/ /g, '_') || ''
  const profile = colaborador ? { 
    ...colaborador, 
    role: roleName, 
    role_name: colaborador?.roles?.nombre,
    departamento_name: colaborador?.departamentos?.nombre,
    modulos_habilitados: colaborador?.modulos_habilitados || ['dashboard'],
  } : null

  // If profile is null (RLS blocked read), do NOT redirect to onboarding
  // onboarding_completado must be explicitly FALSE to trigger the redirect
  if (colaborador !== null && colaborador?.onboarding_completado === false) {
    redirect('/onboarding')
  }

  // Get clients the user has access to
  const { data: clientAccess } = await supabase
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', user.id)

  const clientIds = clientAccess?.map(ca => ca.client_id) || []

  // administrador and project_manager see all clients; others see only assigned clients
  const isFullAccess = roleName === 'administrador' || roleName === 'project_manager'
  let clientsQuery = supabase.from('clientes').select('*')

  if (!isFullAccess && clientIds.length > 0) {
    clientsQuery = clientsQuery.in('id', clientIds)
  } else if (!isFullAccess && clientIds.length === 0) {
    // No access at all for other roles with no assignments
    clientsQuery = clientsQuery.in('id', ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: clientsData } = await clientsQuery.order('nombre_del_negocio')
  const clients = (clientsData || []).map(c => ({ ...c, business_name: c.nombre_del_negocio }))

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
