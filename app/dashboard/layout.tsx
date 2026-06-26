import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

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
    .select('id, nombre, apellido, email, rol_id, puesto, activo, avatar_url, onboarding_completado, modulos_habilitados, roles(id, nombre), departamentos(id, nombre)')
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

  return (
    <DashboardShell 
      user={user} 
      profile={profile}
    >
      {children}
    </DashboardShell>
  )
}

