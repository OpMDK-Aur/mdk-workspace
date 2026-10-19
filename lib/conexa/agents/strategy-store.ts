import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/tasks/subtasks-api'
import type { Persona, StrategyInput, StrategyRun } from './creative-strategy-types'

export const STRATEGY_TABLE = 'estrategias_creativos'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Supabase = Awaited<ReturnType<typeof requireUser>>['supabase']

type RunRow = {
  id: string
  cliente_id: string
  creado_por: string | null
  created_at: string
  input: StrategyInput
  personas: Persona[]
}

export async function requireClientAccess(clientId: unknown) {
  if (typeof clientId !== 'string' || !UUID.test(clientId)) {
    return { error: NextResponse.json({ error: 'Cliente inválido' }, { status: 400 }) } as const
  }
  const { supabase, user, error } = await requireUser()
  if (error || !user) return { error: error ?? NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const
  const { data: client } = await supabase.from('clientes').select('id, nombre_del_negocio').eq('id', clientId).maybeSingle()
  if (!client) return { error: NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 }) } as const
  return { supabase, user, clientId, clientName: (client.nombre_del_negocio as string | null) ?? '' } as const
}

async function userName(supabase: Supabase, userId: string | null) {
  if (!userId) return null
  const { data } = await supabase.from('colaboradores').select('nombre, apellido').eq('id', userId).maybeSingle()
  return data ? [data.nombre, data.apellido].filter(Boolean).join(' ') : null
}

async function toRun(supabase: Supabase, row: RunRow): Promise<StrategyRun> {
  return {
    id: row.id,
    clientId: row.cliente_id,
    createdBy: row.creado_por ?? '',
    createdByName: await userName(supabase, row.creado_por),
    createdAt: row.created_at,
    input: row.input,
    personas: row.personas,
    persisted: true,
  }
}

export async function saveRun(supabase: Supabase, run: Omit<StrategyRun, 'id' | 'createdAt' | 'persisted'>): Promise<StrategyRun> {
  const { data, error } = await supabase
    .from(STRATEGY_TABLE)
    .insert({ cliente_id: run.clientId, creado_por: run.createdBy, input: run.input, personas: run.personas })
    .select('id, cliente_id, creado_por, created_at, input, personas')
    .single<RunRow>()
  if (error || !data) {
    console.error('[creative-strategy] No se pudo guardar la ejecución:', error?.message)
    return {
      ...run,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdByName: await userName(supabase, run.createdBy),
      persisted: false,
    }
  }
  return toRun(supabase, data)
}

export async function loadLatestRun(supabase: Supabase, clientId: string) {
  const { data, error } = await supabase
    .from(STRATEGY_TABLE)
    .select('id, cliente_id, creado_por, created_at, input, personas')
    .eq('cliente_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<RunRow>()
  if (error || !data) return null
  return toRun(supabase, data)
}

export async function loadRun(supabase: Supabase, runId: string) {
  if (!UUID.test(runId)) return null
  const { data } = await supabase
    .from(STRATEGY_TABLE)
    .select('id, cliente_id, creado_por, created_at, input, personas')
    .eq('id', runId)
    .maybeSingle<RunRow>()
  return data ? toRun(supabase, data) : null
}

export async function updateRunPersonas(supabase: Supabase, runId: string, personas: Persona[]) {
  const { error } = await supabase.from(STRATEGY_TABLE).update({ personas }).eq('id', runId)
  if (error) console.error('[creative-strategy] No se pudo actualizar la ejecución:', error.message)
}
