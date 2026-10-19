export type KnownSource = 'GTM' | 'CRM' | 'GA4' | 'META' | 'GOOGLE_ADS' | 'HISTORIAL'

export type ThreadSummary = {
  taskId: string
  commentsCount: number
  spanDays: number
  summary: string
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

export function hashComments(comments: Pick<ThreadComment, 'id' | 'content'>[]): string {
  let h = 5381
  for (const c of comments) {
    const s = `${c.id}:${c.content}|`
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
