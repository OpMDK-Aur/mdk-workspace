import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { ClientOverview } from '@/components/dashboard/client-overview'
import type { Client, Profile } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseClient()

  // Load client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  // Load all profiles (for pm/am lookup)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url, email')
    .order('full_name')

  // Load campaigns for this client from Meta + Google (via scorecard data pattern)
  const { data: currentUser } = await supabase.auth.getUser()
  const { data: currentProfile } = currentUser?.user
    ? await supabase.from('profiles').select('*').eq('id', currentUser.user.id).single()
    : { data: null }

  return (
    <ClientOverview
      client={client as Client}
      profiles={(profiles ?? []) as Profile[]}
      currentProfile={currentProfile as Profile | null}
    />
  )
}
