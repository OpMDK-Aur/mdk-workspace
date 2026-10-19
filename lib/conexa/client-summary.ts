import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { ClientManagementSummary, SummaryItem, SummaryPeriod } from './client-summary-types'

const MODEL = 'openai/gpt-4o-mini'
const MAX_DESCRIPTION_CHARS = 400
const MAX_COMMENT_CHARS = 300
const MAX_COMMENTS_PER_TASK = 4

export type SummaryTask = {
  id: string
  title: string
  description: string | null
  state: string
  priority: string | null
  type: string | null
  assignee: string | null
  dueDate: string | null
  updatedAt: string | null
  comments: { author: string; content: string; createdAt: string }[]
}

const FOCUS_HINTS: Record<string, string> = {
  todo: 'Toda la gestión del cliente, sin filtrar por área.',
  tecnologia:
    'Solo tareas de tecnología: desarrollo web, landings, integraciones, CRM, automatizaciones, APIs, píxeles y tracking, dominios, hosting, bugs.',
  marketing:
    'Solo tareas de marketing: campañas de Meta/Google Ads, presupuestos, estrategia, contenido, redes sociales, email marketing, reportes de performance, SEO.',
  diseno: 'Solo tareas de diseño: piezas gráficas, creativos, banners, videos, branding, UI de landings.',
}

const itemSchema = z.object({
  text: z.string().describe('Una oración concreta.'),
  taskId: z.string().describe('ID de la tarea de la que sale, o cadena vacía si es general.'),
})

const modelSchema = z.object({
  relevantTaskIds: z.array(z.string()).describe('IDs de las tareas que corresponden al enfoque pedido.'),
  summary: z
    .string()
    .describe('Resumen de la gestión en 3 a 5 oraciones: qué se hizo, en qué se está trabajando y cómo está la relación con el cliente.'),
  done: z.array(itemSchema).max(6).describe('Logros o entregas completadas más relevantes.'),
  inProgress: z.array(itemSchema).max(6).describe('Lo que está en curso ahora.'),
  blockers: z.array(itemSchema).max(5).describe('Bloqueos, atrasos o pedidos sin respuesta. Vacío si no hay.'),
  nextSteps: z.array(itemSchema).max(5).describe('Próximos pasos sugeridos, accionables.'),
})

const SYSTEM = `Sos Conexa, asistente de una agencia de marketing. Resumís la gestión de un cliente a partir de sus tareas y comentarios, en español rioplatense, claro y sin relleno.
Reglas:
- Usá solo la información provista. No inventes fechas, números ni resultados.
- Primero elegí qué tareas corresponden al enfoque usando tipo, título, descripción y comentarios. Si ninguna corresponde, devolvé relevantTaskIds vacío y decilo en el resumen.
- Basá todo el resumen únicamente en las tareas relevantes.
- Mencioná personas por su nombre cuando aporte.
- Una tarea vencida y no completada es un bloqueo.`

function truncate(text: string | null, max: number) {
  if (!text) return ''
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function serializeTask(t: SummaryTask) {
  const lines = [
    `[${t.id}] ${t.title}`,
    `  tipo: ${t.type ?? 'sin tipo'} · estado: ${t.state} · prioridad: ${t.priority ?? '-'} · responsable: ${t.assignee ?? 'sin asignar'}${t.dueDate ? ` · vence: ${t.dueDate.slice(0, 10)}` : ''}`,
  ]
  const description = truncate(t.description, MAX_DESCRIPTION_CHARS)
  if (description) lines.push(`  descripción: ${description}`)
  for (const c of t.comments.slice(0, MAX_COMMENTS_PER_TASK)) {
    lines.push(`  - ${c.author} (${c.createdAt.slice(0, 10)}): ${truncate(c.content, MAX_COMMENT_CHARS)}`)
  }
  return lines.join('\n')
}

export async function summarizeClientManagement(input: {
  clientName: string
  focus: string
  focusLabel: string
  period: SummaryPeriod
  tasks: SummaryTask[]
  tasksTotal: number
}): Promise<ClientManagementSummary> {
  const hint = FOCUS_HINTS[input.focus] ?? `Solo tareas relacionadas con: "${input.focus}".`
  const today = new Date().toISOString().slice(0, 10)

  const { output } = await generateText({
    model: MODEL,
    system: SYSTEM,
    output: Output.object({ schema: modelSchema }),
    prompt: `Cliente: ${input.clientName}
Hoy: ${today}
Enfoque: ${input.focusLabel}. ${hint}

Tareas (${input.tasks.length}):
${input.tasks.map(serializeTask).join('\n\n')}`,
  })

  const validIds = new Set(input.tasks.map(t => t.id))
  const relevant = new Set(output.relevantTaskIds.filter(id => validIds.has(id)))
  const byState: Record<string, number> = {}
  for (const t of input.tasks) {
    if (relevant.has(t.id)) byState[t.state] = (byState[t.state] ?? 0) + 1
  }

  const clean = (items: { text: string; taskId: string }[]): SummaryItem[] =>
    items.map(i => ({ text: i.text, taskId: validIds.has(i.taskId) ? i.taskId : null }))

  return {
    focusLabel: input.focusLabel,
    period: input.period,
    summary: output.summary,
    done: clean(output.done),
    inProgress: clean(output.inProgress),
    blockers: clean(output.blockers),
    nextSteps: clean(output.nextSteps),
    tasksConsidered: relevant.size,
    tasksTotal: input.tasksTotal,
    byState,
    generatedAt: new Date().toISOString(),
  }
}
