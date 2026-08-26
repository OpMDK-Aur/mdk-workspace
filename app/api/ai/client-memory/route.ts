import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { buildClientMemory, emptyClientMemory, normalizeIndustry } from '@/lib/ai/client-memory'

export async function GET(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const clientId = new URL(request.url).searchParams.get('clientId'); if (!clientId) return NextResponse.json({ memory: emptyClientMemory() })
  const admin = createAdminClient()
  const { data, error } = await admin.from('ai_client_profile').select('industry, commercial_objective, product_type, primary_conversion_type, industry_source, commercial_objective_source, product_type_source, primary_conversion_source').eq('client_id', clientId).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo cargar el contexto.' }, { status: 500 })
  return NextResponse.json({ memory: buildClientMemory(data as Record<string, unknown> | null) })
}

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({})); if (typeof body.clientId !== 'string' || !body.clientId) return NextResponse.json({ error: 'clientId es requerido.' }, { status: 400 })
  const update: Record<string, string> = {}
  for (const key of ['commercial_objective', 'product_type', 'primary_conversion_type'] as const) if (typeof body[key] === 'string' && body[key].trim()) { update[key] = body[key].trim(); update[`${key}_source`] = 'user_confirmed' }
  if (typeof body.industry === 'string' && body.industry.trim()) { update.industry = normalizeIndustry(body.industry); update.industry_source = 'user_confirmed' }
  if (!update.industry || !update.commercial_objective || !update.product_type) return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
  const admin = createAdminClient()
  const { data: client, error: clientError } = await admin.from('clientes').select('id').eq('id', body.clientId).maybeSingle()
  if (clientError || !client) {
    console.error('[v0] client-memory client lookup failed:', { code: clientError?.code, message: clientError?.message, clientId: body.clientId })
    return NextResponse.json({ error: 'El cliente seleccionado no existe o no está disponible.' }, { status: 404 })
  }
  const { error } = await admin.from('ai_client_profile').upsert({ client_id: body.clientId, ...update, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
  if (error) {
    console.error('[v0] client-memory save failed:', { code: error.code, message: error.message, details: error.details })
    return NextResponse.json({ error: 'No se pudo guardar el contexto.' }, { status: 500 })
  }
  return NextResponse.json({ memory: buildClientMemory({ ...update }) })
}
