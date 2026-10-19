import { NextResponse } from 'next/server'
import { isUuid, requireUser } from '@/lib/tasks/subtasks-api'
import {
  CONEXA_AUTHOR_NAME,
  generateCommentReply,
  htmlToPlainText,
  replyToHtml,
} from '@/lib/conexa/comment-reply'

export const maxDuration = 60

const MAX_QUESTION_CHARS = 2000

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Tarea inválida' }, { status: 400 })
  const { supabase, user, error: authError } = await requireUser()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const question = typeof body?.question === 'string' ? htmlToPlainText(body.question).slice(0, MAX_QUESTION_CHARS) : ''
  if (!question) return NextResponse.json({ error: 'Falta la pregunta' }, { status: 400 })

  const [{ data: task, error: taskError }, { data: rows, error: commentsError }, { data: me }] = await Promise.all([
    supabase.from('tareas').select('id, titulo, descripcion').eq('id', id).maybeSingle(),
    supabase
      .from('comentarios_tareas')
      .select('autor_nombre, contenido, created_at')
      .eq('tarea_id', id)
      .order('created_at', { ascending: true })
      .limit(200),
    supabase.from('colaboradores').select('nombre').eq('id', user!.id).maybeSingle(),
  ])
  if (taskError || commentsError) return NextResponse.json({ error: 'No se pudo leer la tarea' }, { status: 500 })
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  let reply: string
  try {
    reply = await generateCommentReply({
      taskTitle: task.titulo ?? 'Tarea',
      taskDescription: task.descripcion ?? null,
      comments: (rows ?? []).map(r => ({
        author: r.autor_nombre || 'Alguien',
        createdAt: r.created_at,
        content: r.contenido ?? '',
      })),
      question,
      askedBy: me?.nombre || 'Un colaborador',
    })
  } catch (err) {
    console.error('Conexa reply failed:', err)
    return NextResponse.json({ error: 'Conexa no pudo responder' }, { status: 502 })
  }
  if (!reply) return NextResponse.json({ error: 'Conexa no pudo responder' }, { status: 502 })

  const { error: insertError } = await supabase.from('comentarios_tareas').insert({
    tarea_id: id,
    contenido: replyToHtml(reply),
    autor_nombre: CONEXA_AUTHOR_NAME,
    es_sistema: true,
  })
  if (insertError) {
    console.error('Conexa reply insert failed:', insertError)
    return NextResponse.json({ error: 'No se pudo guardar la respuesta' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
