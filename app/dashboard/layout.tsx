import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

// Cache revalidation
export const revalidate = 60 // Revalidate every 60 seconds

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

  // Run queries in parallel for better performance
  const [colaboradorResult, clientAccessResult] = await Promise.all([
    supabase
      .from('colaboradores')
      .select('*, roles(id, nombre), departamentos(id, nombre)')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
  ])

  const colaborador = colaboradorResult.data

  // Map rol name to profile.role for compatibility
  const roleName = colaborador?.roles?.nombre?.toLowerCase().replace(/ /g, '_') || ''
  const fullName = [colaborador?.nombre, colaborador?.apellido].filter(Boolean).join(' ') || null
  const profile = colaborador ? { 
    ...colaborador, 
    full_name: fullName,
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

  const clientIds = clientAccessResult.data?.map(ca => ca.client_id) || []

  // master, administrador and project_manager see all clients; others see only assigned clients
  const isFullAccess = roleName === 'master' || roleName === 'administrador' || roleName === 'project_manager'
  
  // Only select needed fields for sidebar, not all columns
  let clientsQuery = supabase.from('clientes').select('id, nombre_del_negocio, plan')

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
