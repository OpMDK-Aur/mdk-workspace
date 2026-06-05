import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import type { Client } from '@/lib/types'

// Cache revalidation
export const revalidate = 60

// Force chunk rebuild v3
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

  // Get colaborador data
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('*, roles(id, nombre), departamentos(id, nombre)')
    .eq('id', user.id)
    .maybeSingle()

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
    puesto: colaborador?.puesto || null,
  } : null

  // If profile is null (RLS blocked read), do NOT redirect to onboarding
  // onboarding_completado must be explicitly FALSE to trigger the redirect
  if (colaborador !== null && colaborador?.onboarding_completado === false) {
    redirect('/onboarding')
  }

  // All users see all clients
  const { data: clientsData } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre_del_negocio')
  
  const clients = (clientsData || []) as Client[]

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

