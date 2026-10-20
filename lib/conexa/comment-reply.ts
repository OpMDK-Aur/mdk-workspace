import { generateText } from 'ai'

const MODEL = 'openai/gpt-4o-mini'
const MAX_COMMENTS = 60
const MAX_COMMENT_CHARS = 1500

export const CONEXA_AUTHOR_NAME = 'Conexa'
export const CONEXA_REPLY_MARKER = '<span data-conexa-reply="1"></span>'

const SYSTEM = `Sos Conexa, asistente de una agencia de marketing. Te mencionan en el hilo de comentarios de una tarea y respondés ahí mismo, en español rioplatense, breve y concreto.
Reglas:
- Respondé lo que te piden en el último mensaje usando la tarea y el hilo como contexto.
- Si te piden un resumen, resumí qué se pidió, qué se decidió y qué queda pendiente.
- No inventes datos, fechas, montos, IDs ni nombres. Si falta información, decí qué falta y a quién preguntarle.
- Mencioná a las personas por su nombre. Sin saludos ni despedidas. Máximo 120 palabras.
- Texto plano: párrafos cortos o líneas que empiecen con "- " para listas.`

export function htmlToPlainText(html: string) {
  return html
    .split('|||ATTACHMENTS|||')[0]
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function replyToHtml(text: string) {
  const blocks: string[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) blocks.push(`<ul>${list.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`)
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const item = line.match(/^[-*•]\s+(.*)$/)
    if (item) { list.push(item[1]); continue }
    flush()
    blocks.push(`<p>${escapeHtml(line)}</p>`)
  }
  flush()
  return `${CONEXA_REPLY_MARKER}${blocks.join('')}`
}

export async function generateCommentReply(input: {
  taskTitle: string
  taskDescription: string | null
  comments: { author: string; createdAt: string; content: string }[]
  question: string
  askedBy: string
}) {
  const transcript = input.comments
    .slice(-MAX_COMMENTS)
    .map(c => `[${c.createdAt.slice(0, 10)}] ${c.author}: ${htmlToPlainText(c.content).slice(0, MAX_COMMENT_CHARS)}`)
    .join('\n')

  const description = input.taskDescription ? htmlToPlainText(input.taskDescription).slice(0, 3000) : 'Sin descripción'

  const { text } = await generateText({
    model: MODEL,
    system: SYSTEM,
    prompt: `Tarea: ${input.taskTitle}\nDescripción: ${description}\n\nHilo de comentarios:\n${transcript || '(sin comentarios previos)'}\n\n${input.askedBy} te pregunta: ${input.question}`,
  })

  return text.trim()
}
