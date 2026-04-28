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

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

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

  // Get current user profile
  const { data: currentProfile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  // Current month range for time tracking
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  // Get current user's assignment for this client
  const { data: assignment } = user
    ? await supabase
        .from('client_assignments')
        .select('min_hours, max_hours')
        .eq('user_id', user.id)
        .eq('client_id', id)
        .eq('active', true)
        .single()
    : { data: null }

  // Get current user's tracked hours this month for this client
  const { data: entries } = user
    ? await supabase
        .from('time_entries')
        .select('duration_sec')
        .eq('user_id', user.id)
        .eq('client_id', id)
        .gte('started_at', startOfMonth)
        .lte('started_at', endOfMonth)
        .not('ended_at', 'is', null)
    : { data: [] }

  const trackedHours = (entries ?? []).reduce((acc, e) => acc + ((e.duration_sec ?? 0) / 3600), 0)

  return (
    <ClientOverview
      client={client as Client}
      profiles={(profiles ?? []) as Profile[]}
      currentProfile={currentProfile as Profile | null}
      assignment={assignment as { min_hours: number; max_hours: number } | null}
      trackedHours={trackedHours}
    />
  )
}
