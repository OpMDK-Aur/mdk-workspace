import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface Subtask {
  id: string
  taskId: string
  title: string
  done: boolean
  assigneeId: string | null
  dueDate: string | null
  position: number
  aiGenerated: boolean
  source: string | null
  createdAt: string
}

export const SUBTASK_COLUMNS =
  'id, tarea_id, titulo, completada, asignado_a, fecha_vencimiento, orden, ai_generado, origen, created_at'

export interface SubtaskRow {
  id: string
  tarea_id: string
  titulo: string
  completada: boolean
  asignado_a: string | null
  fecha_vencimiento: string | null
  orden: number
  ai_generado: boolean
  origen: string | null
  created_at: string
}

export function toSubtask(r: SubtaskRow): Subtask {
  return {
    id: r.id,
    taskId: r.tarea_id,
    title: r.titulo,
    done: r.completada,
    assigneeId: r.asignado_a,
    dueDate: r.fecha_vencimiento,
    position: r.orden,
    aiGenerated: r.ai_generado,
    source: r.origen,
    createdAt: r.created_at,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { supabase, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  return { supabase, user: data.user, error: null }
}

type Fields = { title?: unknown; done?: unknown; assigneeId?: unknown; dueDate?: unknown; position?: unknown }

export function validateFields(body: Fields): { row: Record<string, unknown> } | { message: string } {
  const row: Record<string, unknown> = {}
  if ('title' in body) {
    if (typeof body.title !== 'string') return { message: 'Título inválido' }
    const t = body.title.trim()
    if (!t || t.length > 500) return { message: 'El título debe tener entre 1 y 500 caracteres' }
    row.titulo = t
  }
  if ('done' in body) {
    if (typeof body.done !== 'boolean') return { message: 'Estado inválido' }
    row.completada = body.done
  }
  if ('assigneeId' in body) {
    if (body.assigneeId !== null && !isUuid(body.assigneeId)) return { message: 'Responsable inválido' }
    row.asignado_a = body.assigneeId
  }
  if ('dueDate' in body) {
    if (body.dueDate !== null && (typeof body.dueDate !== 'string' || !DATE.test(body.dueDate)))
      return { message: 'Fecha inválida' }
    row.fecha_vencimiento = body.dueDate
  }
  if ('position' in body) {
    if (typeof body.position !== 'number' || !Number.isInteger(body.position) || body.position < 0)
      return { message: 'Posición inválida' }
    row.orden = body.position
  }
  return { row }
}
