import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { getToolCatalog } from '@/lib/ai/tools'
import { SUPERVISOR_REQUIRED_TOOL_KEYS } from '@/lib/ai/agents/supervisor-tools'

const bodySchema = z.object({
  systemPrompt: z.string().trim().min(20, 'El prompt es demasiado corto.').max(50000, 'El prompt es demasiado largo.'),
})

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function loadSupervisor() {
  const admin = createAdminClient()
  const { data: agent, error } = await admin
    .from('ai_agents')
    .select('id, name, model, system_prompt, updated_at')
    .eq('slug', 'supervisor')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  if (!agent) return null
  const { data: toolRows, error: toolsError } = await admin.from('ai_agent_tools').select('tool_key, is_enabled').eq('agent_id', agent.id)
  if (toolsError) throw toolsError
  return { agent, toolRows: toolRows ?? [] }
}

export async function GET() {
  if (!(await getUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await loadSupervisor()
    if (!result) return NextResponse.json({ error: 'No se encontró el agente supervisor.' }, { status: 404 })
    const { agent, toolRows } = result
    const enabledInDb = new Set(toolRows.filter((row) => row.is_enabled).map((row) => row.tool_key))
    const required = new Set<string>(SUPERVISOR_REQUIRED_TOOL_KEYS)
    const tools = getToolCatalog().map(({ key, description }) => ({
      key,
      description,
      enabled: enabledInDb.has(key) || required.has(key),
      required: required.has(key),
    }))
    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.system_prompt,
      updatedAt: agent.updated_at,
      tools,
    })
  } catch (error) {
    console.error('[v0] supervisor config load failed:', error)
    return NextResponse.json({ error: 'No se pudo cargar la configuración del supervisor.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!(await getUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Prompt inválido.' }, { status: 400 })
  const admin = createAdminClient()
  const updatedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('ai_agents')
    .update({ system_prompt: parsed.data.systemPrompt, updated_at: updatedAt })
    .eq('slug', 'supervisor')
    .eq('is_active', true)
    .select('system_prompt, updated_at')
    .maybeSingle()
  if (error || !data) {
    console.error('[v0] supervisor prompt save failed:', error)
    return NextResponse.json({ error: 'No se pudo guardar el prompt.' }, { status: 500 })
  }
  return NextResponse.json({ systemPrompt: data.system_prompt, updatedAt: data.updated_at })
}
