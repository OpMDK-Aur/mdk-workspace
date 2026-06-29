import { createClient } from '@/lib/supabase/server'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default async function DashboardPage() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: colaborador } = user ? await supabase
      .from('colaboradores')
      .select('*, roles(id, nombre)')
      .eq('id', user.id)
      .single() : { data: null }

    // Map rol name to profile.role for compatibility
    const roleName = colaborador?.roles?.nombre?.toLowerCase().replace(/ /g, '_') || ''
    const profile = colaborador ? { ...colaborador, role: roleName } : null

    // All users see all clients
    const { data: clientsData } = await supabase.from('clientes').select('*').order('nombre_del_negocio')
    const clients = (clientsData || []).map(c => ({ ...c, business_name: c.nombre_del_negocio }))

    return (
      <DashboardContent clients={clients} profile={profile} />
    )
  } catch (error) {
    console.error('[Dashboard] Error loading data:', error)
    if (error instanceof Error) {
      console.error('[Dashboard] Error message:', error.message)
      console.error('[Dashboard] Error stack:', error.stack)
    }
    // Still render the component with empty data so user can see the UI
    return (
      <DashboardContent clients={[]} profile={null} />
    )
  }
}
