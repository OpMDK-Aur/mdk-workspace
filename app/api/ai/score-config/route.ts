import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  clientId: z.string().uuid(),
  low: z.string().trim().min(10).max(4000),
  intermediate: z.string().trim().min(10).max(4000),
  high: z.string().trim().min(10).max(4000),
})

const defaultConfig = { low: 'Campaña con CPL alto, 0 impresiones o 0 conversiones. Optimización baja y necesita acciones inmediatas.', intermediate: 'Campaña con señales mixtas: el rendimiento requiere seguimiento y ajustes para mejorar la eficiencia.', high: 'Campaña con buen volumen, conversiones y eficiencia. Optimización alta; mantener y escalar con control.' }

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
  const { data, error } = await supabase.from('ai_client_score_config').select('client_id, low_description, intermediate_description, high_description').eq('client_id', parsed.data).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo cargar la configuración.' }, { status: 500 })
  return NextResponse.json({ clientId: parsed.data, lowDescription: data?.low_description ?? defaultConfig.low, intermediateDescription: data?.intermediate_description ?? defaultConfig.intermediate, highDescription: data?.high_description ?? defaultConfig.high, persisted: Boolean(data) })
}

export async function POST(request: Request) {
  const supabase = await getAuthenticatedClient()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Configuración inválida.' }, { status: 400 })
  const { clientId, low, intermediate, high } = parsed.data
  const { error } = await supabase.from('ai_client_score_config').upsert({ client_id: clientId, low_description: low, intermediate_description: intermediate, high_description: high, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
  if (error) {
    console.error('[v0] score config save failed:', { code: error.code, message: error.message })
    return NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 })
  }
  return NextResponse.json({ clientId, lowDescription: low, intermediateDescription: intermediate, highDescription: high, persisted: true })
}
