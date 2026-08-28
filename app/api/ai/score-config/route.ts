import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  clientId: z.string().uuid(),
  objective: z.string().trim().min(10).max(4000),
})

const defaultObjective = 'Optimizar el costo por lead (CPL) y aumentar la cantidad de conversiones calificadas sin desperdiciar presupuesto.'

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? supabase : null
}

export async function GET(request: Request) {
  const supabase = await getAuthenticatedClient()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const clientId = new URL(request.url).searchParams.get('clientId')
  const parsed = z.string().uuid().safeParse(clientId)
  if (!parsed.success) return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })
  const { data, error } = await supabase.from('ai_client_score_config').select('client_id, objective').eq('client_id', parsed.data).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo cargar la configuración.' }, { status: 500 })
  return NextResponse.json({ clientId: parsed.data, objective: data?.objective ?? defaultObjective, persisted: Boolean(data) })
}

export async function POST(request: Request) {
  const supabase = await getAuthenticatedClient()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Configuración inválida.' }, { status: 400 })
  const { clientId, objective } = parsed.data
  const { error } = await supabase.from('ai_client_score_config').upsert({ client_id: clientId, objective, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
  if (error) {
    console.error('[v0] score config save failed:', { code: error.code, message: error.message })
    return NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 })
  }
  return NextResponse.json({ clientId, objective, persisted: true })
}
