import { generateText } from 'ai'

export const maxDuration = 15

export async function POST(req: Request) {
  try {
    const { userMessage, assistantMessage } = await req.json()

    if (!userMessage && !assistantMessage) {
      return Response.json({ titulo: 'Nueva conversación' })
    }

    const { text } = await generateText({
      model: 'openai/gpt-5-mini',
      system:
        'Eres un asistente que genera títulos cortos para conversaciones de análisis de marketing digital. ' +
        'Devuelve SOLO el título, sin comillas, sin punto final, máximo 6 palabras, en español. ' +
        'El título debe resumir el tema principal de la conversación.',
      prompt:
        `Genera un título corto para esta conversación.\n\n` +
        `Usuario: ${String(userMessage || '').slice(0, 500)}\n` +
        `Analista: ${String(assistantMessage || '').slice(0, 500)}`,
    })

    const titulo = text
      .trim()
      .replace(/^["'#\s-]+|["'.\s]+$/g, '')
      .slice(0, 60)

    return Response.json({ titulo: titulo || 'Nueva conversación' })
  } catch (error) {
    console.error('[v0] Error generating title:', error)
    return Response.json({ titulo: 'Nueva conversación' })
  }
}
