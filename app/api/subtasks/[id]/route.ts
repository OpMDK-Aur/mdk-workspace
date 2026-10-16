import { NextResponse } from 'next/server'
import { SUBTASK_COLUMNS, isUuid, requireUser, toSubtask, validateFields, type SubtaskRow } from '@/lib/tasks/subtasks-api'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Subtarea inválida' }, { status: 400 })
  const { supabase, error: authError } = await requireUser()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  const parsed = validateFields(body)
  if ('message' in parsed) return NextResponse.json({ error: parsed.message }, { status: 400 })
  if (!Object.keys(parsed.row).length) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })

  const { data, error } = await supabase
    .from('subtareas_tareas')
    .update(parsed.row)
    .eq('id', id)
    .select(SUBTASK_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(toSubtask(data as SubtaskRow))
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Subtarea inválida' }, { status: 400 })
  const { supabase, error: authError } = await requireUser()
  if (authError) return authError

  const { error } = await supabase.from('subtareas_tareas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
