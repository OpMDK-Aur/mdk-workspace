import type { SupabaseClient } from '@supabase/supabase-js'

export const MATCH_THRESHOLD = 0.45
export const TIE_MARGIN = 0.1

const STOPWORDS = new Set(['de', 'la', 'el', 'y', 'a', 'en', 'para', 'con', 'por', 'los', 'las', 'del', 'al', 'un', 'una', 'que', 'se', 'o'])

export type SeguimientoGrupo = 'urgente' | 'semana' | 'recurrente' | 'depende_cliente' | 'onboarding' | 'tarjetas'
export type MatchEstado = 'vinculada' | 'sin_match' | 'pendiente'

export interface SeguimientoItem {
  id: string
  usuario_id: string
  semana: string
  grupo: SeguimientoGrupo
  cliente_nombre: string | null
  cliente_id: string | null
  titulo: string
  detalles: string[]
  prioridad: 'alta' | 'media' | 'baja' | null
  fecha_vencimiento: string | null
  deadline_texto: string | null
  tarea_id: string | null
  match_estado: MatchEstado
  completado: boolean
  created_at: string
}

export interface TareaLite {
  id: string
  titulo: string
  estado: string
  fecha_vencimiento: string | null
  cliente_id: string | null
  cliente_ids: string[] | null
  asignado_a: string | null
  asignados_a: string[] | null
}

export interface Candidate {
  id: string
  titulo: string
  estado: string
  fecha_vencimiento: string | null
  score: number
}

export interface SeguimientoPayload {
  items: SeguimientoItem[]
  tareas: Record<string, TareaLite>
  candidates: Record<string, Candidate[]>
  summary: { vinculada: number; pendiente: number; sin_match: number }
}

export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(text: string, exclude: Set<string>) {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !exclude.has(t))
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

// Task titles are typed by hand ("Segumiento de Conversciones"), so near-identical tokens count as equal.
function tokensMatch(a: string, b: string) {
  if (a === b) return true
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) && b.startsWith(a.slice(0, 5)))) return true
  if (a.length >= 6 && b.length >= 6) return levenshtein(a, b) <= 2
  return false
}

export function similarity(itemTitle: string, taskTitle: string, clientName?: string | null) {
  const exclude = new Set(clientName ? normalize(clientName).split(' ') : [])
  const a = tokenize(itemTitle, exclude)
  const b = tokenize(taskTitle, exclude)
  if (a.length === 0 || b.length === 0) return 0

  const used = new Set<number>()
  let matched = 0
  for (const ta of a) {
    const idx = b.findIndex((tb, i) => !used.has(i) && tokensMatch(ta, tb))
    if (idx >= 0) {
      used.add(idx)
      matched++
    }
  }
  let score = matched / (a.length + b.length - matched)

  const na = a.join(' ')
  const nb = b.join(' ')
  if (na.includes(nb) || nb.includes(na)) score += 0.25

  return Math.min(1, Math.round(score * 100) / 100)
}

function belongsTo(tarea: TareaLite, usuarioId: string, clienteId: string) {
  const assigned = tarea.asignado_a === usuarioId || (tarea.asignados_a ?? []).includes(usuarioId)
  const sameClient = tarea.cliente_id === clienteId || (tarea.cliente_ids ?? []).includes(clienteId)
  return assigned && sameClient
}

export function rankCandidates(item: SeguimientoItem, tareas: TareaLite[]): Candidate[] {
  if (!item.cliente_id) return []
  return tareas
    .filter((t) => t.estado !== 'resuelto' && belongsTo(t, item.usuario_id, item.cliente_id!))
    .map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      fecha_vencimiento: t.fecha_vencimiento,
      score: similarity(item.titulo, t.titulo, item.cliente_nombre),
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 5)
}

export function decideMatch(candidates: Candidate[]): { estado: MatchEstado; tareaId: string | null } {
  const [best, second] = candidates
  if (!best || best.score < MATCH_THRESHOLD) return { estado: 'sin_match', tareaId: null }
  if (second && second.score >= MATCH_THRESHOLD && best.score - second.score < TIE_MARGIN) {
    return { estado: 'pendiente', tareaId: null }
  }
  return { estado: 'vinculada', tareaId: best.id }
}

const TAREA_FIELDS = 'id, titulo, estado, fecha_vencimiento, cliente_id, cliente_ids, asignado_a, asignados_a'

/**
 * Loads one person's week. With `runMatch`, items still in `pendiente` and without a task get matched and saved.
 * Items linked to a task that is now `resuelto` are always marked completed.
 */
export async function loadSeguimiento(
  db: SupabaseClient,
  usuarioId: string,
  semana: string,
  { runMatch }: { runMatch: boolean },
): Promise<SeguimientoPayload> {
  const { data: itemsData, error } = await db
    .from('seguimiento_items')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('semana', semana)
    .order('created_at')
  if (error) throw error
  const items = (itemsData ?? []) as SeguimientoItem[]

  const { data: openData } = await db
    .from('tareas')
    .select(TAREA_FIELDS)
    .neq('estado', 'resuelto')
    .or(`asignado_a.eq.${usuarioId},asignados_a.cs.{${usuarioId}}`)
    .limit(1000)
  const openTareas = (openData ?? []) as TareaLite[]

  const linkedIds = items.map((i) => i.tarea_id).filter((id): id is string => Boolean(id))
  const tareas: Record<string, TareaLite> = {}
  if (linkedIds.length > 0) {
    const { data: linked } = await db.from('tareas').select(TAREA_FIELDS).in('id', linkedIds)
    for (const t of (linked ?? []) as TareaLite[]) tareas[t.id] = t
  }

  const candidates: Record<string, Candidate[]> = {}
  const updates: { id: string; patch: Partial<SeguimientoItem> }[] = []

  for (const item of items) {
    if (item.grupo === 'tarjetas') continue
    const ranked = rankCandidates(item, openTareas)
    candidates[item.id] = ranked

    if (item.tarea_id) {
      const tarea = tareas[item.tarea_id]
      if (tarea?.estado === 'resuelto' && !item.completado) {
        updates.push({ id: item.id, patch: { completado: true } })
      }
      continue
    }

    if (runMatch && item.match_estado === 'pendiente') {
      const decision = decideMatch(ranked)
      const patch: Partial<SeguimientoItem> = { match_estado: decision.estado }
      if (decision.tareaId) {
        patch.tarea_id = decision.tareaId
        const t = openTareas.find((x) => x.id === decision.tareaId)
        if (t) tareas[t.id] = t
      }
      if (decision.estado !== 'pendiente') updates.push({ id: item.id, patch })
    }
  }

  await Promise.all(updates.map((u) => db.from('seguimiento_items').update(u.patch).eq('id', u.id)))
  const patched = items.map((i) => {
    const u = updates.find((x) => x.id === i.id)
    return u ? { ...i, ...u.patch } : i
  })

  const summary = { vinculada: 0, pendiente: 0, sin_match: 0 }
  for (const i of patched) if (i.grupo !== 'tarjetas') summary[i.match_estado]++

  return { items: patched, tareas, candidates, summary }
}

export function mondayOf(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return toISODate(d)
}

export function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
