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

  // Load unidades de negocio
  const { data: unidadesDeNegocio } = await supabase
    .from('clientes_unidades_de_negocio')
    .select('unidad_de_negocio_id, unidad_de_negocio(id, nombre)')
    .eq('cliente_id', id)

  // Load all colaboradores (for pm/am lookup)
  const { data: colaboradores } = await supabase
    .from('colaboradores')
    .select('id, nombre, apellido, rol_id, avatar_url, email, roles(nombre)')
    .order('nombre')

  // Map colaboradores to profiles format with full_name and role
  const profiles = (colaboradores ?? []).map(c => ({
    id: c.id,
    email: c.email,
    full_name: [c.nombre, c.apellido].filter(Boolean).join(' ') || null,
    role: (c.roles as { nombre: string } | null)?.nombre?.toLowerCase().replace(/ /g, '_') || '',
    avatar_url: c.avatar_url,
  }))

  // Get current user colaborador with role
  const { data: currentColaborador } = user
    ? await supabase.from('colaboradores').select('*, roles(id, nombre)').eq('id', user.id).single()
    : { data: null }
  
  // Map to Profile format with role
  const currentProfile = currentColaborador ? {
    ...currentColaborador,
    role: (currentColaborador.roles as { id: string; nombre: string } | null)?.nombre?.toLowerCase().replace(/ /g, '_') || '',
  } : null

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

  // Get ALL tracked hours this month for this client (all users - team total)
  // Table: entradas_de_tiempo, fields: cliente_id, duracion_seg, iniciado_en, finalizado_en
  const { data: allEntries } = await supabase
    .from('entradas_de_tiempo')
    .select('duracion_seg')
    .eq('cliente_id', id)
    .gte('iniciado_en', startOfMonth)
    .lte('iniciado_en', endOfMonth)
    .not('finalizado_en', 'is', null)

  const horasEquipo = (allEntries ?? []).reduce((acc, e) => acc + ((e.duracion_seg ?? 0) / 3600), 0)

  // Get metricas_colaborador for this client (current month/year)
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  
  const { data: metricasColaborador } = await supabase
    .from('metricas_colaborador')
    .select(`
      id,
      colaborador_id,
      fee_administrado,
      valor_hora,
      horas_teoricas_cliente,
      minimo_no_negociable_horas,
      horas_objetivo,
      acumulado_mes_asignado,
      porcentaje_asignacion,
      colaboradores:colaborador_id (
        id,
        nombre,
        apellido,
        avatar_url
      )
    `)
    .eq('cliente_id', id)
    .eq('mes', currentMonth)
    .eq('anio', currentYear)

  // Get current user's tracked hours this month for this client (my hours)
  const { data: myEntries } = user
    ? await supabase
        .from('entradas_de_tiempo')
        .select('duracion_seg')
        .eq('cliente_id', id)
        .eq('colaborador_id', user.id)
        .gte('iniciado_en', startOfMonth)
        .lte('iniciado_en', endOfMonth)
        .not('finalizado_en', 'is', null)
    : { data: [] }

  const misHoras = (myEntries ?? []).reduce((acc, e) => acc + ((e.duracion_seg ?? 0) / 3600), 0)

  // Get horas objetivo from current user's colaborador record (weekly)
  const horasObjetivo = currentProfile?.capacidad_horas_semanales 
    ? parseFloat(currentProfile.capacidad_horas_semanales) 
    : 40

  return (
    <ClientOverview
      client={mappedClient as Client}
      profiles={(profiles ?? []) as Profile[]}
      currentProfile={currentProfile as Profile | null}
      assignment={assignment as { min_hours: number; max_hours: number } | null}
      trackedHours={misHoras}
      horasObjetivo={horasObjetivo}
      horasEquipo={horasEquipo}
      misHoras={misHoras}
      unidadesDeNegocio={unidadesDeNegocio ?? []}
      metricasColaborador={metricasColaborador ?? []}
    />
  )
}
