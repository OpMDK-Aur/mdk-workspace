import { NextResponse } from 'next/server'
import { isUuid, requireUser } from '@/lib/tasks/subtasks-api'
import { summarizeClientManagement, type SummaryTask } from '@/lib/conexa/client-summary'
import {
  focusLabelFor,
  MAX_CUSTOM_FOCUS,
  SUMMARY_PERIODS,
  type ClientManagementSummary,
  type SummaryPeriod,
} from '@/lib/conexa/client-summary-types'

export const maxDuration = 60

const MAX_TASKS = 120
const MAX_COMMENTS = 300
const DAY_MS = 86_400_000
const MAX_CACHE = 300
const cache = new Map<string, ClientManagementSummary>()

type Joined<T> = T | T[] | null
const one = <T,>(value: Joined<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value)

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })
  const { supabase, error: authError } = await requireUser()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const focus = typeof body?.focus === 'string' ? body.focus.trim().slice(0, MAX_CUSTOM_FOCUS) : ''
  if (!focus) return NextResponse.json({ error: 'Elegí un enfoque' }, { status: 400 })
  const period: SummaryPeriod = SUMMARY_PERIODS.some(p => p.value === body?.period) ? body.period : '90'
  const force = body?.force === true

  const { data: client } = await supabase.from('clientes').select('id, nombre_del_negocio').eq('id', id).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  let query = supabase
    .from('tareas')
    .select(
      'id, titulo, descripcion, estado, prioridad, fecha_vencimiento, updated_at, tipo_de_tareas:tipo_tarea_id(nombre), colaboradores:asignado_a(nombre, apellido)',
    )
    .or(`cliente_id.eq.${id},cliente_ids.cs.{${id}}`)
    .order('updated_at', { ascending: false })
    .limit(MAX_TASKS)
  if (period !== 'all') query = query.gte('updated_at', new Date(Date.now() - Number(period) * DAY_MS).toISOString())

  const { data: rows, error: tasksError } = await query
  if (tasksError) return NextResponse.json({ error: 'No pudimos leer las tareas' }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'El cliente no tiene tareas en este período' }, { status: 422 })
  }

  const cacheKey = `${id}:${focus.toLowerCase()}:${period}:${rows.length}:${rows[0]?.updated_at ?? ''}`
  if (!force) {
    const cached = cache.get(cacheKey)
    if (cached) return NextResponse.json(cached)
  }

  const taskIds = rows.map(r => r.id as string)
  const { data: commentRows } = await supabase
    .from('comentarios_tareas')
    .select('tarea_id, contenido, created_at, autor_nombre')
    .in('tarea_id', taskIds)
    .eq('es_sistema', false)
    .order('created_at', { ascending: false })
    .limit(MAX_COMMENTS)

  const commentsByTask = new Map<string, SummaryTask['comments']>()
  for (const c of commentRows ?? []) {
    const list = commentsByTask.get(c.tarea_id as string) ?? []
    list.push({
      author: (c.autor_nombre as string | null) || 'Alguien',
      content: (c.contenido as string | null) ?? '',
      createdAt: c.created_at as string,
    })
    commentsByTask.set(c.tarea_id as string, list)
  }

  const tasks: SummaryTask[] = rows.map(r => {
    const type = one(r.tipo_de_tareas as Joined<{ nombre: string | null }>)
    const person = one(r.colaboradores as Joined<{ nombre: string | null; apellido: string | null }>)
    return {
      id: r.id as string,
      title: r.titulo as string,
      description: (r.descripcion as string | null) ?? null,
      state: (r.estado as string) ?? 'pendiente',
      priority: (r.prioridad as string | null) ?? null,
      type: type?.nombre ?? null,
      assignee: person ? [person.nombre, person.apellido].filter(Boolean).join(' ') || null : null,
      dueDate: (r.fecha_vencimiento as string | null) ?? null,
      updatedAt: (r.updated_at as string | null) ?? null,
      comments: commentsByTask.get(r.id as string) ?? [],
    }
  })

  try {
    const summary = await summarizeClientManagement({
      clientName: client.nombre_del_negocio as string,
      focus,
      focusLabel: focusLabelFor(focus),
      period,
      tasks,
      tasksTotal: tasks.length,
    })
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
    cache.set(cacheKey, summary)
    return NextResponse.json(summary)
  } catch (error) {
    console.error('[conexa] client summary failed', error)
    return NextResponse.json({ error: 'Conexa no pudo generar el resumen' }, { status: 502 })
  }
}
