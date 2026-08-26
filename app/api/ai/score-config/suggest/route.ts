import { NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const bodySchema = z.object({
  clientId: z.string().uuid(),
  low: z.string().trim().max(4000).optional(),
  intermediate: z.string().trim().max(4000).optional(),
  high: z.string().trim().max(4000).optional(),
})

const suggestionSchema = z.object({
  low: z.string(),
  intermediate: z.string(),
  high: z.string(),
})

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? supabase : null
}

export async function POST(request: Request) {
  const supabase = await getAuthenticatedClient()
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 })
  const { clientId, low, intermediate, high } = parsed.data

  const { data: client } = await supabase.from('clientes').select('nombre_del_negocio').eq('id', clientId).maybeSingle()
  const clientName = client?.nombre_del_negocio || 'este cliente'

  const hasDrafts = Boolean(low || intermediate || high)

  try {
    const { output: suggestion } = await generateText({
      model: 'openai/gpt-5-mini',
      system:
        'Eres un estratega senior de paid media que ayuda a definir criterios de optimización de campañas para una agencia de marketing digital. ' +
        'Escribís en español, en tono profesional y directo, con oraciones cortas (1-2 frases por nivel). ' +
        'Cada nivel describe cuándo una campaña se considera en ese estado, mencionando señales concretas (CPL, impresiones, conversiones, eficiencia, volumen, tendencia) y qué acción implica. ' +
        'Los tres niveles deben ser coherentes entre sí, progresivos y mutuamente excluyentes: Baja (alerta, requiere acción inmediata), Intermedia (señales mixtas, requiere seguimiento), Alta (buen desempeño, mantener y escalar).',
      prompt: hasDrafts
        ? `Cliente: ${clientName}.\n\nTengo estos borradores de criterios de optimización, mejorá la redacción y la claridad de cada uno sin cambiar su intención, y completá los niveles que falten para que sean coherentes con los demás:\n\n` +
          `Baja: ${low || '(sin definir, proponé una redacción coherente con los otros niveles)'}\n` +
          `Intermedia: ${intermediate || '(sin definir, proponé una redacción coherente con los otros niveles)'}\n` +
          `Alta: ${high || '(sin definir, proponé una redacción coherente con los otros niveles)'}`
        : `Cliente: ${clientName}.\n\nProponé criterios de optimización de campañas de paid media para los tres niveles (Baja, Intermedia, Alta), pensados para una cuenta publicitaria genérica.`,
      output: Output.object({ schema: suggestionSchema }),
    })

    return NextResponse.json({
      lowDescription: suggestion.low,
      intermediateDescription: suggestion.intermediate,
      highDescription: suggestion.high,
    })
  } catch (error) {
    console.error('[v0] score config suggestion failed:', error)
    return NextResponse.json({ error: 'No se pudo generar la sugerencia.' }, { status: 500 })
  }
}
