import { generateText, Output } from 'ai'
import { z } from 'zod'
import { hashComments, type ThreadComment, type ThreadSummary } from './tasks'

const MODEL = 'openai/gpt-4o-mini'
const DAY_MS = 86_400_000
const MAX_COMMENT_CHARS = 1500
const MAX_COMMENTS = 80

const modelSchema = z.object({
  summary: z.string().describe('Resumen del hilo en 2 a 4 oraciones: qué se pidió, qué se decidió y en qué estado quedó.'),
  openAsks: z
    .array(
      z.object({
        text: z.string().describe('Pedido o pregunta que sigue sin respuesta, en una oración.'),
        askedBy: z.string().describe('Nombre de quien lo pidió, tal como aparece en el hilo.'),
        items: z.array(z.string()).describe('Datos concretos que faltan, textuales como aparecen en `text`.'),
      }),
    )
    .describe('Solo pedidos que nadie respondió todavía. Vacío si no hay.'),
  draftReply: z
    .string()
    .describe('Respuesta breve para destrabar los pendientes, usando solo información del hilo. Vacío si no hay pendientes.'),
  proposedSubtasks: z
    .array(z.object({ title: z.string(), source: z.string().describe('De qué comentario sale.') }))
    .max(5)
    .describe('Acciones concretas que surgen del hilo. Vacío si no hay.'),
})

const SYSTEM = `Sos Conexa, asistente de una agencia de marketing. Resumís hilos de comentarios de tareas en español rioplatense, claro y sin relleno.
Reglas:
- Usá solo lo que está en los comentarios. No inventes datos, fechas, IDs ni nombres.
- Si algo se respondió más adelante en el hilo, no lo marques como pendiente.
- Mencioná a las personas por su nombre.`

function daysBetween(from: number, to: number) {
  return Math.max(0, Math.floor((to - from) / DAY_MS))
}

export async function summarizeThread(input: {
  taskId: string
  taskTitle: string
  comments: ThreadComment[]
  authorNames: Map<string, string>
}): Promise<ThreadSummary> {
  const now = Date.now()
  const times = input.comments.map(c => new Date(c.createdAt).getTime()).sort((a, b) => a - b)
  const first = times[0] ?? now
  const last = times[times.length - 1] ?? now

  const transcript = input.comments
    .slice(-MAX_COMMENTS)
    .map(c => {
      const author = (c.authorId && input.authorNames.get(c.authorId)) || 'Alguien'
      const date = new Date(c.createdAt).toISOString().slice(0, 10)
      return `[${date}] ${author}: ${c.content.slice(0, MAX_COMMENT_CHARS)}`
    })
    .join('\n')

  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    prompt: `Tarea: "${input.taskTitle}"\n\nComentarios (del más viejo al más nuevo):\n${transcript}`,
    output: Output.object({ schema: modelSchema }),
  })

  return {
    taskId: input.taskId,
    commentsCount: input.comments.length,
    spanDays: Math.max(1, daysBetween(first, now)),
    summary: output.summary,
    openAsks: output.openAsks,
    unansweredDays: output.openAsks.length > 0 ? daysBetween(last, now) : null,
    known: [],
    missing: [],
    draftReply: output.draftReply,
    proposedSubtasks: output.proposedSubtasks.map(s => ({ ...s, assigneeId: null })),
    generatedAt: new Date(now).toISOString(),
    commentsHash: hashComments(input.comments),
  }
}
