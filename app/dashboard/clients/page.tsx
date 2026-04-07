import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { ClientsListContent } from '@/components/dashboard/clients-list-content'
import type { Client, Profile } from '@/lib/types'

export default async function ClientsPage() {
  const supabase = await createSupabaseClient()

  // Load all clients
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('business_name')

  // Load all profiles for manager dropdowns
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url, email')
    .in('role', ['project_manager', 'account_manager'])
    .order('full_name')

  // Get current user profile
  const { data: currentUser } = await supabase.auth.getUser()
  const { data: currentProfile } = currentUser?.user
    ? await supabase.from('profiles').select('*').eq('id', currentUser.user.id).single()
    : { data: null }

  return (
    <ClientsListContent
      clients={(clients ?? []) as Client[]}
      profiles={(profiles ?? []) as Profile[]}
      currentProfile={currentProfile as Profile | null}
    />
  )
}
