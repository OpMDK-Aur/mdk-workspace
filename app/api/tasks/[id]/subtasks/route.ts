import { NextResponse } from 'next/server'
import { SUBTASK_COLUMNS, isUuid, requireUser, toSubtask, validateFields, type SubtaskRow } from '@/lib/tasks/subtasks-api'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Tarea inválida' }, { status: 400 })
  const { supabase, error: authError } = await requireUser()
  if (authError) return authError

  const { data, error } = await supabase
    .from('subtareas_tareas')
    .select(SUBTASK_COLUMNS)
    .eq('tarea_id', id)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data as SubtaskRow[]).map(toSubtask))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Tarea inválida' }, { status: 400 })
  const { supabase, error: authError } = await requireUser()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('title' in body))
    return NextResponse.json({ error: 'Falta el título' }, { status: 400 })
  const parsed = validateFields({ title: body.title, assigneeId: body.assigneeId ?? null, dueDate: body.dueDate ?? null })
  if ('message' in parsed) return NextResponse.json({ error: parsed.message }, { status: 400 })

  const { data: last } = await supabase
    .from('subtareas_tareas')
    .select('orden')
    .eq('tarea_id', id)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('subtareas_tareas')
    .insert({
      ...parsed.row,
      tarea_id: id,
      orden: last ? last.orden + 1 : 0,
      ai_generado: body.aiGenerated === true,
      origen: typeof body.source === 'string' && body.source.trim() ? body.source.trim().slice(0, 200) : null,
    })
    .select(SUBTASK_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toSubtask(data as SubtaskRow), { status: 201 })
}
