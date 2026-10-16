import { NextResponse } from 'next/server'
import { isUuid, requireUser } from '@/lib/tasks/subtasks-api'
import { hashComments, summarizeThread, type ThreadSummary } from '@/lib/conexa/tasks'

const cache = new Map<string, ThreadSummary>()
const MAX_CACHE = 500

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Tarea inválida' }, { status: 400 })
  const { supabase, error: authError } = await requireUser()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const force = body?.force === true

  const [{ data: task, error: taskError }, { data: rows, error: commentsError }] = await Promise.all([
    supabase.from('tareas').select('id, titulo').eq('id', id).maybeSingle(),
    supabase
      .from('comentarios_tareas')
      .select('id, autor_id, contenido, created_at, es_sistema')
      .eq('tarea_id', id)
      .eq('es_sistema', false)
      .order('created_at', { ascending: true }),
  ])
  if (taskError || commentsError) return NextResponse.json({ error: 'No pudimos leer el hilo' }, { status: 500 })
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  const comments = (rows ?? []).map(r => ({
    id: r.id as string,
    authorId: (r.autor_id as string | null) ?? null,
    content: r.contenido as string,
    createdAt: r.created_at as string,
  }))
  const key = `${id}:${hashComments(comments)}`

  if (!force) {
    const cached = cache.get(key)
    if (cached) return NextResponse.json(cached)
  }

  const summary = summarizeThread({ taskId: id, taskTitle: task.titulo as string, comments })
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(key, summary)
  return NextResponse.json(summary)
}
