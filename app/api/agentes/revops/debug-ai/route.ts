// app/api/agentes/revops/debug-ai/route.ts
// Endpoint de diagnóstico TEMPORAL. Aísla la llamada a generateObject del resto
// del pipeline de RevOps para confirmar si el problema es el modelo, el AI
// Gateway, o el schema. Borrar este archivo una vez resuelto el bug real.
import { generateObject } from 'ai'
import { z } from 'zod'
import { NextResponse } from 'next/server'

export const maxDuration = 60

const calidadSchema = z.object({
  escucha_antes_de_ofrecer: z.boolean(),
  personaliza_respuesta: z.boolean(),
  hace_preguntas_indagacion: z.boolean(),
  genera_confianza: z.number().min(1).max(5),
  propone_proximo_paso: z.boolean(),
  resumen: z.string(),
  score: z.number().min(1).max(10),
})

const transcriptDePrueba = `Cliente: Hola, quería consultar precios
Vendedor/Bot: Hola! Tenemos varios planes disponibles, te paso el catálogo`

export async function GET() {
  const intentos: Array<{ model: string; ok: boolean; resultado?: unknown; error?: string }> = []

  const modelosAProbar = [
    'anthropic/claude-opus-4.6',
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-opus-4-6',
  ]

  for (const model of modelosAProbar) {
    try {
      const { object } = await generateObject({
        model,
        schema: calidadSchema,
        system: 'Sos un auditor de calidad comercial. Evaluá la transcripción dada según el schema.',
        prompt: transcriptDePrueba,
      })
      intentos.push({ model, ok: true, resultado: object })
    } catch (err) {
      intentos.push({
        model,
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err),
      })
    }
  }

  return NextResponse.json({ intentos }, { status: 200 })
}