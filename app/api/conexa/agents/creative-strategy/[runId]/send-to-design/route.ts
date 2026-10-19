import { NextResponse } from 'next/server'
import { z } from 'zod'
import { creativeBriefHtml } from '@/lib/conexa/agents/creative-strategy'
import { requireClientAccess, loadRun, updateRunPersonas } from '@/lib/conexa/agents/strategy-store'
import {
  creativeTaskTitle,
  personaTaskTitle,
  type Creative,
  type Persona,
} from '@/lib/conexa/agents/creative-strategy-types'

const bodySchema = z.object({
  clientId: z.string(),
  clientName: z.string().max(200),
  creativeIds: z.array(z.string().max(10)).min(1).max(60),
  groupBy: z.enum(['creative', 'persona']),
  assigneeId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  priority: z.enum(['alta', 'media', 'baja']),
  personas: z.array(z.any()).optional(),
})

type TaskPlan = { title: string; description: string; creativeIds: string[] }

function planTasks(personas: Persona[], selected: Set<string>, groupBy: 'creative' | 'persona', clientName: string, runId: string): TaskPlan[] {
  const plans: TaskPlan[] = []
  for (const persona of personas) {
    const creatives = persona.creatives.filter((creative) => selected.has(creative.id) && creative.status === 'por_disenar')
    if (!creatives.length) continue
    if (groupBy === 'creative') {
      for (const creative of creatives) {
        plans.push({ title: creativeTaskTitle(creative, persona), description: creativeBriefHtml(creative, persona, runId), creativeIds: [creative.id] })
      }
    } else {
      plans.push({
        title: personaTaskTitle(persona, clientName),
        description: creatives.map((creative) => creativeBriefHtml(creative, persona, runId)).join('<hr />'),
        creativeIds: creatives.map((creative) => creative.id),
      })
    }
  }
  return plans
}

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos para crear las tareas' }, { status: 400 })
  const body = parsed.data

  const access = await requireClientAccess(body.clientId)
  if ('error' in access) return access.error
  const { supabase, user } = access

  const stored = await loadRun(supabase, runId)
  if (stored && stored.clientId !== access.clientId) return NextResponse.json({ error: 'La estrategia no es de este cliente' }, { status: 403 })
  const personas = (stored?.personas ?? body.personas) as Persona[] | undefined
  if (!personas?.length) return NextResponse.json({ error: 'No encontramos la estrategia' }, { status: 404 })

  const plans = planTasks(personas, new Set(body.creativeIds), body.groupBy, body.clientName || access.clientName, runId)
  if (!plans.length) return NextResponse.json({ error: 'Los creativos elegidos ya están en diseño' }, { status: 400 })

  const [{ data: designType }, { data: assignee }] = await Promise.all([
    supabase.from('tipo_de_tareas').select('id').or('nombre.ilike.diseño gráfico,nombre.ilike.diseno grafico').limit(1).maybeSingle(),
    supabase.from('colaboradores').select('id, nombre, apellido').eq('id', body.assigneeId).maybeSingle(),
  ])
  if (!assignee) return NextResponse.json({ error: 'Responsable no encontrado' }, { status: 400 })
  const assigneeName = [assignee.nombre, assignee.apellido].filter(Boolean).join(' ')

  const rows = plans.map((plan) => ({
    id: crypto.randomUUID(),
    titulo: plan.title,
    descripcion: plan.description,
    tipo_tarea_id: (designType?.id as string | undefined) ?? null,
    cliente_id: access.clientId,
    cliente_ids: [access.clientId],
    asignado_a: body.assigneeId,
    asignados_a: [body.assigneeId],
    estado: 'pendiente',
    prioridad: body.priority,
    fecha_vencimiento: body.dueDate,
    creado_por: user.id,
  }))

  const { error: insertError } = await supabase.from('tareas').insert(rows)
  if (insertError) {
    console.error('[creative-strategy] No se pudieron crear las tareas:', insertError.message)
    return NextResponse.json({ error: 'No pudimos crear las tareas' }, { status: 500 })
  }

  const taskByCreative = new Map<string, string>()
  plans.forEach((plan, index) => plan.creativeIds.forEach((creativeId) => taskByCreative.set(creativeId, rows[index].id)))
  const updatedPersonas: Persona[] = personas.map((persona) => ({
    ...persona,
    creatives: persona.creatives.map((creative): Creative => {
      const taskId = taskByCreative.get(creative.id)
      return taskId ? { ...creative, taskId, assigneeName, status: 'en_diseno' } : creative
    }),
  }))
  if (stored) await updateRunPersonas(supabase, runId, updatedPersonas)

  return NextResponse.json({
    tasks: rows.map((row, index) => ({ id: row.id, title: row.titulo, creativeIds: plans[index].creativeIds })),
    assigneeName,
    personas: updatedPersonas,
    typeFound: Boolean(designType),
  })
}
