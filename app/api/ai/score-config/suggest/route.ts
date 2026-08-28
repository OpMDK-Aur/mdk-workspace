import { NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const bodySchema = z.object({
  clientId: z.string().uuid(),
  objective: z.string().trim().min(10).max(4000),
})

const suggestionSchema = z.object({
  objective: z.string(),
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
  const { clientId, objective } = parsed.data

  const { data: client } = await supabase.from('clientes').select('nombre_del_negocio').eq('id', clientId).maybeSingle()
  const clientName = client?.nombre_del_negocio || 'este cliente'

  try {
    const { output: suggestion } = await generateText({
      model: 'openai/gpt-5-mini',
      system:
        'Eres un estratega senior de paid media que ayuda a definir un único objetivo de optimización para una agencia de marketing digital. ' +
        'Escribís en español, en tono profesional y directo, con una sola frase clara. ' +
        'No agregues parámetros ni objetivos alternativos: conservá el objetivo principal y mejorá únicamente su precisión y accionabilidad.',
      prompt: `Cliente: ${clientName}.\n\nMejorá la redacción de este único objetivo de optimización de paid media sin cambiar su intención. Debe explicar claramente qué se busca optimizar, cómo se considera alcanzado y qué evidencia debería revisar el analista. No menciones tres niveles ni inventes un segundo objetivo.\n\nObjetivo: ${objective}`,
      output: Output.object({ schema: suggestionSchema }),
    })

    return NextResponse.json({ objective: suggestion.objective })
  } catch (error) {
    console.error('[v0] score config suggestion failed:', error)
    return NextResponse.json({ error: 'No se pudo generar la sugerencia.' }, { status: 500 })
  }
}
