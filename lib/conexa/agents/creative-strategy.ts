import { generateText, Output } from 'ai'
import { z } from 'zod'
import {
  CREATIVE_ANGLES,
  CREATIVE_FORMATS,
  type Creative,
  type Persona,
  type StrategyInput,
} from './creative-strategy-types'

const MODEL = 'openai/gpt-4o-mini'
const CREATIVES_PER_PERSONA = 3

export type StrategyContext = {
  crmWonSummary?: string | null
  ga4TopPages?: string | null
  metaTopAds?: string | null
  competitorAds?: string | null
}

export const strategyInputSchema = z.object({
  business: z.string().trim().min(1).max(200),
  website: z.string().trim().max(300),
  goal: z.string().trim().min(1).max(2000),
  personasCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  sources: z.object({ crm: z.boolean(), ga4: z.boolean(), metaHistory: z.boolean(), competitors: z.boolean() }),
})

const modelCreativeSchema = z.object({
  format: z.enum(CREATIVE_FORMATS),
  angle: z.enum(CREATIVE_ANGLES),
  painNumber: z.number().int().min(1).describe('Número del dolor de esta persona que ataca (1 = primer dolor).'),
  hook: z.string(),
  message: z.string(),
  cta: z.string(),
  andromedaSignal: z.string().describe('A qué audiencia le indica este creativo a Meta.'),
})

const modelPersonaSchema = z.object({
  name: z.string(),
  profile: z.string(),
  wants: z.string(),
  pains: z.array(z.string()),
  creatives: z.array(modelCreativeSchema),
})

const modelOutputSchema = z.object({ personas: z.array(modelPersonaSchema) })
type ModelOutput = z.infer<typeof modelOutputSchema>

function validateOutput(output: ModelOutput, personasCount: number): string | null {
  if (output.personas.length < 3 || output.personas.length > 5) return 'Debe haber entre 3 y 5 personas.'
  if (output.personas.length !== personasCount) return `Se pidieron ${personasCount} personas.`
  for (const persona of output.personas) {
    if (persona.pains.length < 2) return `"${persona.name}" necesita al menos 2 dolores.`
    if (persona.creatives.length !== CREATIVES_PER_PERSONA) return `"${persona.name}" necesita ${CREATIVES_PER_PERSONA} creativos.`
    if (new Set(persona.creatives.map((creative) => creative.format)).size !== persona.creatives.length) return `"${persona.name}" repite formatos.`
    if (new Set(persona.creatives.map((creative) => creative.angle)).size !== persona.creatives.length) return `"${persona.name}" repite ángulos.`
  }
  return null
}

function contextLine(label: string, enabled: boolean, value?: string | null) {
  if (!enabled) return ''
  return `${label}: ${value?.trim() ? value.trim() : 'sin datos disponibles'}.`
}

function systemPrompt(input: StrategyInput, context: StrategyContext) {
  const contextText = [
    contextLine('Ganados del CRM', input.sources.crm, context.crmWonSummary),
    contextLine('Páginas que convierten en Analytics (90 días)', input.sources.ga4, context.ga4TopPages),
    contextLine('Histórico de anuncios en Meta', input.sources.metaHistory, context.metaTopAds),
    contextLine('Anuncios de la competencia', input.sources.competitors, context.competitorAds),
  ].filter(Boolean).join(' ') || 'Sin contexto adicional.'

  return `Actuás como especialista en Meta Ads con foco en el algoritmo de Andrómeda. Tu especialidad es armar estructuras de creativos que le den al algoritmo señales claras para encontrar la audiencia correcta. Sabés que el creativo ES el targeting: el contenido del anuncio le indica a Meta a quién mostrárselo.
Negocio: ${input.business}. Sitio web: ${input.website || 'no informado'}. Objetivo y clientes objetivo: ${input.goal}.
Contexto disponible: ${contextText}
Definí ${input.personasCount} buyer personas. Para cada una identificá mínimo 2 puntos de dolor (sumá más si son relevantes).
BUYER PERSONA: nombre descriptivo · Perfil (quién es, qué hace, qué le importa) · Dolor (el problema que el producto resuelve) · Lo que desea (el resultado que busca).
Por cada persona, 3 creativos: CREATIVO [N] - [Formato: video corto / imagen / carrusel / UGC] · Ángulo (problema-solución / testimonial / educativo / comparación / urgencia) · Hook (primeras palabras o imagen que engancha en 3 segundos) · Mensaje central · CTA · Señal para Andrómeda (a qué audiencia le indica el creativo).
Reglas: formato distinto por creativo dentro de cada persona; ángulos distintos entre sí; tono adaptado a cada persona; español argentino con voseo. No inventes datos del negocio: usá solo el contexto provisto.
Respondé en JSON con el schema StrategyRun.personas.`
}

function toPersonas(output: ModelOutput): Persona[] {
  let creativeNumber = 0
  return output.personas.map((persona, personaIndex) => {
    const personaId = `P${personaIndex + 1}`
    const pains = persona.pains.map((text, painIndex) => ({ id: `D${painIndex + 1}`, text }))
    const creatives: Creative[] = persona.creatives.map((creative) => {
      creativeNumber += 1
      const painIndex = Math.min(Math.max(creative.painNumber, 1), pains.length) - 1
      return {
        id: `C${String(creativeNumber).padStart(2, '0')}`,
        personaId,
        painId: pains[painIndex].id,
        format: creative.format,
        angle: creative.angle,
        hook: creative.hook,
        message: creative.message,
        cta: creative.cta,
        andromedaSignal: creative.andromedaSignal,
        status: 'por_disenar',
      }
    })
    return { id: personaId, name: persona.name, profile: persona.profile, wants: persona.wants, pains, creatives }
  })
}

export async function generateStrategy(input: StrategyInput, context: StrategyContext): Promise<Persona[]> {
  const system = systemPrompt(input, context)
  let feedback: string | null = null

  for (let attempt = 0; attempt < 2; attempt++) {
    const { output } = await generateText({
      model: MODEL,
      system,
      prompt: feedback
        ? `La respuesta anterior no cumplió las reglas: ${feedback} Volvé a generar la estructura completa respetando todas las reglas.`
        : 'Generá la estructura de creativos.',
      output: Output.object({ schema: modelOutputSchema }),
    })
    feedback = validateOutput(output, input.personasCount)
    if (!feedback) return toPersonas(output)
  }

  throw new Error(`La estrategia generada no pasó la validación: ${feedback}`)
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Tasks render their description as HTML, so the brief is built as simple HTML blocks. */
export function creativeBriefHtml(creative: Creative, persona: Persona, runId: string) {
  const pain = persona.pains.find((item) => item.id === creative.painId)
  const rows: [string, string][] = [
    ['Persona', `${persona.name}. ${persona.profile}`],
    ['Dolor', `${creative.painId} · ${pain?.text ?? ''}`],
    ['Formato', creative.format],
    ['Ángulo', creative.angle],
    ['Hook', creative.hook],
    ['Mensaje central', creative.message],
    ['CTA', creative.cta],
    ['Medidas', '9:16, 4:5 y 1:1'],
    ['Señal para Andrómeda', creative.andromedaSignal],
  ]
  const body = rows.map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`).join('')
  return `<p><strong>${creative.id} · Brief de creativo</strong></p>${body}<p><em>Origen: Estrategia de creativos · run ${runId} · creativo ${creative.id}</em></p>`
}
