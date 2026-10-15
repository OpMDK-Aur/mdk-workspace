export type KnownSource = 'GTM' | 'CRM' | 'GA4' | 'META' | 'GOOGLE_ADS' | 'HISTORIAL'

export type ThreadSummary = {
  taskId: string
  commentsCount: number
  spanDays: number
  openAsks: { text: string; askedBy: string; items: string[] }[]
  unansweredDays: number | null
  known: { item: string; value: string; source: KnownSource }[]
  missing: string[]
  draftReply: string
  proposedSubtasks: { title: string; assigneeId: string | null; source: string }[]
  generatedAt: string
  commentsHash: string
}

export type ThreadComment = { id: string; authorId: string | null; content: string; createdAt: string }

export const MIN_COMMENTS_FOR_SUMMARY = 2

const DAY_MS = 86_400_000

export function hashComments(comments: Pick<ThreadComment, 'id' | 'content'>[]): string {
  let h = 5381
  for (const c of comments) {
    const s = `${c.id}:${c.content}|`
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

function daysBetween(from: number, to: number) {
  return Math.max(0, Math.floor((to - from) / DAY_MS))
}

/**
 * Stub: the model will extract open asks and draft the reply; `known` must come from
 * integrations queried server-side. Until those are wired, only the reference task
 * returns the prototype payload so no other task shows invented data.
 */
export function summarizeThread(input: {
  taskId: string
  taskTitle: string
  comments: ThreadComment[]
  now?: Date
}): ThreadSummary {
  const now = (input.now ?? new Date()).getTime()
  const times = input.comments.map(c => new Date(c.createdAt).getTime()).sort((a, b) => a - b)
  const first = times[0] ?? now
  const last = times[times.length - 1] ?? now
  const base = {
    taskId: input.taskId,
    commentsCount: input.comments.length,
    spanDays: Math.max(1, daysBetween(first, now)),
    generatedAt: new Date(now).toISOString(),
    commentsHash: hashComments(input.comments),
  }

  if (!/sunaltek/i.test(input.taskTitle)) {
    return {
      ...base,
      openAsks: [],
      unansweredDays: daysBetween(last, now),
      known: [],
      missing: [],
      draftReply: '',
      proposedSubtasks: [],
    }
  }

  return {
    ...base,
    commentsCount: 4,
    spanDays: 9,
    unansweredDays: 9,
    openAsks: [
      {
        text: 'Florencia necesita dominio, contenedor de GTM y destino del formulario para terminar.',
        askedBy: 'florencia',
        items: ['dominio', 'contenedor de GTM', 'destino del formulario'],
      },
    ],
    known: [
      { item: 'contenedor de GTM', value: 'GTM-K7P2Q9', source: 'GTM' },
      { item: 'destino del formulario', value: 'pipeline "Leads web"', source: 'CRM' },
    ],
    missing: ['dominio'],
    draftReply:
      '@Florencia ya tenés 2 de 3: el contenedor de GTM es GTM-K7P2Q9 y el formulario va al pipeline "Leads web" del CRM. El dominio lo confirmo hoy con Sunaltek.',
    proposedSubtasks: [
      { title: 'Confirmar dominio con Sunaltek', assigneeId: 'erika', source: 'Comentario de Florencia' },
      { title: 'Instalar GTM-K7P2Q9 en la landing', assigneeId: 'ivan', source: 'GTM conectado' },
      { title: 'Conectar formulario al pipeline "Leads web"', assigneeId: 'ivan', source: 'CRM' },
    ],
  }
}
