import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

/** Seguimiento is visible to every logged-in collaborator, so after the session check queries run with the admin client. */
export async function requireUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) } as const
  }
  return { user, db: createAdminClient() } as const
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v)
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

export const GRUPOS = ['urgente', 'semana', 'recurrente', 'depende_cliente', 'onboarding', 'tarjetas'] as const
export const PRIORIDADES = ['alta', 'media', 'baja'] as const
export const MATCH_ESTADOS = ['vinculada', 'sin_match', 'pendiente'] as const

/** Keeps only editable fields with valid values. Returns null when something is invalid. */
export function sanitizeItemFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  if ('titulo' in body) {
    if (typeof body.titulo !== 'string' || !body.titulo.trim()) return null
    out.titulo = body.titulo.trim().slice(0, 500)
  }
  if ('grupo' in body) {
    if (!GRUPOS.includes(body.grupo as never)) return null
    out.grupo = body.grupo
  }
  if ('prioridad' in body) {
    if (body.prioridad !== null && !PRIORIDADES.includes(body.prioridad as never)) return null
    out.prioridad = body.prioridad
  }
  if ('fecha_vencimiento' in body) {
    if (body.fecha_vencimiento !== null && !isDate(body.fecha_vencimiento)) return null
    out.fecha_vencimiento = body.fecha_vencimiento
  }
  if ('deadline_texto' in body) {
    if (body.deadline_texto !== null && typeof body.deadline_texto !== 'string') return null
    out.deadline_texto = (body.deadline_texto as string | null)?.trim().slice(0, 120) || null
  }
  if ('detalles' in body) {
    if (!Array.isArray(body.detalles) || body.detalles.some((d) => typeof d !== 'string')) return null
    out.detalles = (body.detalles as string[]).map((d) => d.trim()).filter(Boolean).slice(0, 30)
  }
  if ('cliente_id' in body) {
    if (body.cliente_id !== null && !isUuid(body.cliente_id)) return null
    out.cliente_id = body.cliente_id
  }
  if ('cliente_nombre' in body) {
    if (body.cliente_nombre !== null && typeof body.cliente_nombre !== 'string') return null
    out.cliente_nombre = (body.cliente_nombre as string | null)?.trim().slice(0, 200) || null
  }
  if ('tarea_id' in body) {
    if (body.tarea_id !== null && !isUuid(body.tarea_id)) return null
    out.tarea_id = body.tarea_id
  }
  if ('match_estado' in body) {
    if (!MATCH_ESTADOS.includes(body.match_estado as never)) return null
    out.match_estado = body.match_estado
  }
  if ('completado' in body) {
    if (typeof body.completado !== 'boolean') return null
    out.completado = body.completado
  }
  return out
}
