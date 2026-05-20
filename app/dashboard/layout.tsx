import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import type { Client, ClientStatus } from '@/lib/types'

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
  } : null

  // If profile is null (RLS blocked read), do NOT redirect to onboarding
  // onboarding_completado must be explicitly FALSE to trigger the redirect
  if (colaborador !== null && colaborador?.onboarding_completado === false) {
    redirect('/onboarding')
  }

  // Semaforo ID to status mapping
  const SEMAFORO_MAP: Record<string, ClientStatus> = {
    'd3f4361f-477e-4f7a-9f98-9868cddef57f': 'verde',
    '04dca848-a17e-4626-b83a-5377aef062ec': 'amarillo',
    'c19b9591-862e-49a8-898c-b29ed35fcd3b': 'naranja',
    '753e6c36-5a9f-4b4b-b5fa-aac7d6f281af': 'rojo',
  }

  // All users see all clients
  const clientsQuery = supabase.from('clientes').select('id, nombre_del_negocio, plan, semaforo_id')

  const { data: clientsData } = await clientsQuery.order('nombre_del_negocio')
  
  const clients = (clientsData || []).map(c => ({ 
    id: c.id as string,
    nombre_del_negocio: c.nombre_del_negocio as string,
    business_name: c.nombre_del_negocio as string,
    plan: c.plan as string | null,
    semaforo_id: c.semaforo_id as string | null,
    status: c.semaforo_id ? SEMAFORO_MAP[c.semaforo_id] || null : null,
    // Required fields with defaults
    notion_id: null,
    fee_mdk: null,
    fee_aurelia: null,
    google_ads_customer_id: null,
    meta_ads_account_id: null,
    crm_type: null,
  })) as Client[]

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
