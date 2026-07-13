import { createClient as createSupabaseClient } from '@/lib/supabase/server'
import { ClientsListContent } from '@/components/dashboard/clients-list-content'
import type { Client, Profile } from '@/lib/types'

// Siempre obtener datos frescos de Supabase (sin caché) para reflejar
// cambios hechos directamente en la base de datos.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ClientsPage() {
  const supabase = await createSupabaseClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Load all clients
  const { data: clients } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre_del_negocio', { ascending: true })

  // Load all colaboradores for manager dropdowns
  const { data: colaboradores } = await supabase
    .from('colaboradores')
    .select('id, nombre, apellido, rol_id, puesto, avatar_url, email, roles(nombre)')
    .order('nombre')

  // Map colaboradores to profiles with full_name and role
  const profiles = (colaboradores ?? []).map(c => ({
    id: c.id,
    email: c.email,
    full_name: [c.nombre, c.apellido].filter(Boolean).join(' ') || null,
    role: (c.roles as { nombre: string } | null)?.nombre?.toLowerCase().replace(/ /g, '_') || '',
    avatar_url: c.avatar_url,
    rol_id: c.rol_id,
    puesto: c.puesto,
  }))

  // Get current user colaborador
  const { data: currentProfile } = user
    ? await supabase.from('colaboradores').select('*').eq('id', user.id).single()
    : { data: null }

  // Current month range for time tracking
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  // Get current user's assignments for all clients
  const { data: assignments } = user
    ? await supabase
        .from('client_assignments')
        .select('client_id, min_hours, max_hours')
        .eq('user_id', user.id)
        .eq('active', true)
    : { data: [] }

  // Get current user's tracked hours this month per client
  const { data: entries } = user
    ? await supabase
        .from('time_entries')
        .select('client_id, duration_sec')
        .eq('user_id', user.id)
        .gte('started_at', startOfMonth)
        .lte('started_at', endOfMonth)
        .not('ended_at', 'is', null)
    : { data: [] }

  // Get latest NPS scores for each client - only current month
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const monthStart = new Date(currentYear, now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(currentYear, now.getMonth() + 1, 0).toISOString().split('T')[0]
  
  const { data: npsData } = await supabase
    .from('cliente_nps_historial')
    .select('cliente_id, score, comentario, created_at')
    .gte('created_at', `${monthStart}T00:00:00`)
    .lte('created_at', `${monthEnd}T23:59:59`)
    .order('created_at', { ascending: false })
  
  // Build maps
  const assignmentMap: Record<string, { min_hours: number; max_hours: number }> = {}
  assignments?.forEach(a => { assignmentMap[a.client_id] = a })

  const hoursMap: Record<string, number> = {}
  entries?.forEach(e => {
    if (!e.client_id) return
    hoursMap[e.client_id] = (hoursMap[e.client_id] ?? 0) + ((e.duration_sec ?? 0) / 3600)
  })
  
  // Build NPS map - get latest NPS status for each client
  // Status can be: 'completada' (has score), 'no_completada' (no score), 'no_responde' (comentario = "NO RESPONDE")
  const npsMap: Record<string, { score: number | null; status: 'completada' | 'no_completada' | 'no_responde' }> = {}
  if (npsData) {
    npsData.forEach(record => {
      if (!npsMap[record.cliente_id]) {
        let status: 'completada' | 'no_completada' | 'no_responde' = 'no_completada'
        if (record.comentario && record.comentario.toUpperCase().includes('NO RESPONDE')) {
          status = 'no_responde'
        } else if (record.score !== null && record.score !== undefined) {
          status = 'completada'
        }
        npsMap[record.cliente_id] = {
          score: record.score,
          status
        }
      }
    })
  }

  return (
    <ClientsListContent
      clients={(clients ?? []) as Client[]}
      profiles={(profiles ?? []) as Profile[]}
      currentProfile={currentProfile as Profile | null}
      assignmentMap={assignmentMap}
      hoursMap={hoursMap}
      npsMap={npsMap}
    />
  )
}
