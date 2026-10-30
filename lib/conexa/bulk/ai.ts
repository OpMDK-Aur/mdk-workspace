import 'server-only'
import { generateText, Output } from 'ai'
import type { z } from 'zod'

const MODEL = 'openai/gpt-5-mini'

export class BulkAiError extends Error {}

// La IA solo interpreta; cada respuesta se valida con zod y se reintenta una vez antes de mostrar el error.
export async function askJson<T extends z.ZodTypeAny>(schema: T, system: string, prompt: string, label: string): Promise<z.infer<T>> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({ model: MODEL, system, prompt: attempt ? `${prompt}\n\nTu respuesta anterior no validó. Devolvé SOLO JSON que respete exactamente el esquema.` : prompt, output: Output.object({ schema }) })
      const parsed = schema.safeParse(output)
      if (parsed.success) return parsed.data
      lastError = parsed.error
    } catch (error) {
      lastError = error
    }
  }
  console.error(`[bulk-ai] ${label} failed`, lastError)
  throw new BulkAiError(`La IA no devolvió una respuesta válida para ${label}. Probá de nuevo.`)
}
