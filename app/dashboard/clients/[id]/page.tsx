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
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  // Map nombre_del_negocio to business_name for consistency
  const mappedClient = { ...client, business_name: client.nombre_del_negocio }

  // Load all colaboradores (for pm/am lookup)
  const { data: profiles } = await supabase
    .from('colaboradores')
    .select('id, nombre, apellido, rol_id, avatar_url, email')
    .order('nombre')

  // Get current user colaborador
  const { data: currentProfile } = user
    ? await supabase.from('colaboradores').select('*').eq('id', user.id).single()
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

  // Get ALL tracked hours this month for this client (all users)
  const { data: entries } = await supabase
    .from('time_entries')
    .select('duration_sec')
    .eq('client_id', id)
    .gte('started_at', startOfMonth)
    .lte('started_at', endOfMonth)
    .not('ended_at', 'is', null)

  const trackedHours = (entries ?? []).reduce((acc, e) => acc + ((e.duration_sec ?? 0) / 3600), 0)

  // Get horas objetivo from current user's colaborador record
  const horasObjetivo = currentProfile?.capacidad_horas_semanales 
    ? parseFloat(currentProfile.capacidad_horas_semanales) 
    : 40

  // Horas acumuladas = trackedHours (ya filtrado por este cliente)
  const horasAcumuladas = trackedHours

  return (
    <ClientOverview
      client={mappedClient as Client}
      profiles={(profiles ?? []) as Profile[]}
      currentProfile={currentProfile as Profile | null}
      assignment={assignment as { min_hours: number; max_hours: number } | null}
      trackedHours={trackedHours}
      horasObjetivo={horasObjetivo}
      horasAcumuladas={horasAcumuladas}
    />
  )
}
