import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

const MAX_SUGGESTIONS = 3

// Preguntas iniciales: se van reemplazando por las consultas reales del equipo
// hechas a partir de SUGGESTIONS_SINCE, de la más nueva a la más vieja.
const SEED_QUESTIONS = [
  'Dame el prompt para el informe mensual',
  'Decime qué campañas tuvieron mejor performance en los últimos 7 días',
  'Qué anuncios son los que debería apagar por baja performance',
]
const SUGGESTIONS_SINCE = '2026-10-01T12:40:00Z'

// Respuestas de seguimiento ("Sí", "Y el 29/09?") no sirven como pregunta inicial.
const FOLLOW_UP_PATTERN = /^(s[ií]|no|ok|dale|y|perfecto|gracias|listo|bueno)\b/i
const MIN_LENGTH = 20
const MAX_LENGTH = 180

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.\s]+/g, ' ').trim()
}

function isUsableQuestion(text: string) {
  const trimmed = text.trim()
  return trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH && !FOLLOW_UP_PATTERN.test(trimmed)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await createAdminClient()
    .from('ai_messages')
    .select('content')
    .eq('role', 'user')
    .gte('created_at', SUGGESTIONS_SINCE)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) console.error('[recent-questions] query failed:', error.message)

  const seen = new Set<string>()
  const questions: string[] = []
  for (const candidate of [...(data ?? []).map((row) => String(row.content ?? '').trim()), ...SEED_QUESTIONS]) {
    if (questions.length >= MAX_SUGGESTIONS) break
    if (!isUsableQuestion(candidate)) continue
    const key = normalize(candidate)
    if (seen.has(key)) continue
    seen.add(key)
    questions.push(candidate)
  }

  return NextResponse.json({ questions }, { headers: { 'cache-control': 'no-store' } })
}
