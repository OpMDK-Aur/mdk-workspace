import { z } from 'zod'
import { buildClientMemory, CLIENT_PROFILE_COLUMNS, normalizeIndustry } from '@/lib/ai/client-memory'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { CopilotError } from './route-helpers'
import type { ClientContextRecord } from './types'

import { COMPETITOR_PREFIX, DISCARDED_COMPETITOR_PREFIX, PROFILE_FIELD_KEYS, PROFILE_FIELDS, SUGGESTED_COMPETITOR_MARK, type ProfileFieldKey } from './profile-fields'

export { COMPETITOR_PREFIX, PROFILE_FIELD_KEYS, PROFILE_FIELDS, type ProfileFieldKey }
export type ClientProfile = Record<ProfileFieldKey, string | number | null>
export type ContextLevel = 'debil' | 'intermedio' | 'completo'

export type ContextAssessment = {
  level: ContextLevel
  score: number
  fields: Array<{ key: ProfileFieldKey; label: string; value: string | number | null; filled: boolean; core: boolean }>
  competitors: string[]
  competitorEntries: Array<{ noteId: string; name: string; detail: string; suggested: boolean }>
  discardedCompetitors: string[]
  /** Datos base completos y nunca se cargó ni descartó un competidor: la UI pide sugerencias automáticamente. */
  autoSuggestCompetitors: boolean
  notesCount: number
  missing: Array<{ key: ProfileFieldKey | 'competitors'; label: string; question: string }>
}

export function parseCompetitorNote(content: string) {
  if (!content.startsWith(COMPETITOR_PREFIX)) return null
  const rest = content.slice(COMPETITOR_PREFIX.length)
  const separator = rest.indexOf(':')
  const name = (separator > 0 ? rest.slice(0, separator) : rest).trim()
  return name ? { name, detail: separator > 0 ? rest.slice(separator + 1).trim() : '' } : null
}

export const discardedCompetitorNames = (notes: ClientContextRecord[]) => [...new Set(notes.filter((note) => note.content.startsWith(DISCARDED_COMPETITOR_PREFIX)).map((note) => note.content.slice(DISCARDED_COMPETITOR_PREFIX.length).trim()).filter(Boolean))]

export const competitorNames = (notes: ClientContextRecord[]) => [...new Set(notes.map((note) => parseCompetitorNote(note.content)?.name).filter((name): name is string => Boolean(name)))]

/** Débil: falta algún dato base. Intermedio: datos base completos. Completo: además conversión, un objetivo numérico y al menos un competidor. */
export function assessContext(profile: ClientProfile | null, notes: ClientContextRecord[]): ContextAssessment {
  const fields = PROFILE_FIELDS.map((field) => {
    const value = profile?.[field.key] ?? null
    return { key: field.key, label: field.label, value, core: field.core, filled: value !== null && String(value).trim() !== '' }
  })
  const competitors = competitorNames(notes)
  const filled = (key: ProfileFieldKey) => fields.find((field) => field.key === key)!.filled
  const coreComplete = fields.every((field) => !field.core || field.filled)
  const hasTarget = filled('target_cpl') || filled('target_monthly_sales')
  const complete = coreComplete && filled('primary_conversion_type') && hasTarget && competitors.length > 0
  const missing: ContextAssessment['missing'] = PROFILE_FIELDS.filter((field) => !filled(field.key) && (field.core || field.key === 'primary_conversion_type' || ((field.key === 'target_cpl' || field.key === 'target_monthly_sales') && !hasTarget) || field.key === 'additional_context'))
    .map((field) => ({ key: field.key, label: field.label, question: field.question }))
  if (!competitors.length) missing.push({ key: 'competitors', label: 'Competencia', question: 'Tocá «Sugerir con IA» en el bloque Contexto para que Conexa busque los competidores, o nombrá los que conozcas.' })
  const points = fields.filter((field) => field.filled).length + Math.min(competitors.length, 2) + Math.min(notes.length - competitors.length, 3) * 0.5
  const maxPoints = PROFILE_FIELDS.length + 2 + 1.5
  const competitorEntries = notes.flatMap((note) => {
    const parsed = parseCompetitorNote(note.content)
    return parsed ? [{ noteId: note.id, name: parsed.name, detail: parsed.detail, suggested: parsed.detail.startsWith(SUGGESTED_COMPETITOR_MARK) }] : []
  })
  const discardedCompetitors = discardedCompetitorNames(notes)
  return { level: complete ? 'completo' : coreComplete ? 'intermedio' : 'debil', score: Math.min(1, points / maxPoints), fields, competitors, competitorEntries, discardedCompetitors, autoSuggestCompetitors: coreComplete && !competitorEntries.length && !discardedCompetitors.length, notesCount: notes.length, missing }
}

export async function readClientProfile(clientId: string): Promise<ClientProfile | null> {
  const { data, error } = await createAdminClient().from('ai_client_profile').select(CLIENT_PROFILE_COLUMNS).eq('client_id', clientId).maybeSingle()
  if (error) { console.error('[conexa:copilot:profile] lectura', error.code, error.message); throw new CopilotError('No se pudo leer el Contexto del cliente.', 500) }
  if (!data) return null
  const memory = buildClientMemory(data as Record<string, unknown>)
  return { ...memory.profile, target_cpl: memory.profile.target_cpl ?? null, target_monthly_sales: memory.profile.target_monthly_sales ?? null, additional_context: memory.profile.additional_context ?? null }
}

export const profileUpdateSchema = z.object({ field: z.enum(PROFILE_FIELD_KEYS), value: z.string().trim().min(1).max(600) })
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>

const SOURCE_COLUMN: Partial<Record<ProfileFieldKey, string>> = { industry: 'industry_source', commercial_objective: 'commercial_objective_source', product_type: 'product_type_source', primary_conversion_type: 'primary_conversion_source' }

/** Guarda en el mismo formulario. Se llama solo después de que el usuario confirmó los valores y de validar su acceso al cliente. */
export async function saveProfileUpdates(clientId: string, updates: ProfileUpdate[]) {
  const row: Record<string, string | number | null> = {}
  for (const { field, value } of updates) {
    const definition = PROFILE_FIELDS.find((item) => item.key === field)!
    if (definition.kind === 'number') {
      const number = Number(value.replace(/[^\d,.-]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'))
      if (!Number.isFinite(number) || number < 0) throw new CopilotError(`«${definition.label}» tiene que ser un número positivo.`, 400)
      row[field] = number
    } else row[field] = field === 'industry' ? normalizeIndustry(value) : value
    if (SOURCE_COLUMN[field]) row[SOURCE_COLUMN[field]!] = 'user_confirmed'
  }
  if (!Object.keys(row).length) return readClientProfile(clientId)
  const { error } = await createAdminClient().from('ai_client_profile').upsert({ client_id: clientId, ...row, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
  if (error) { console.error('[conexa:copilot:profile] guardado', error.code, error.message, error.details); throw new CopilotError('No se pudo guardar en el Contexto del cliente.', 500) }
  return readClientProfile(clientId)
}
