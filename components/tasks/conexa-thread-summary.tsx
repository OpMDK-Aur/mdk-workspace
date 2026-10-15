'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { useThreadSummary } from '@/hooks/use-thread-summary'
import { MIN_COMMENTS_FOR_SUMMARY, type ThreadSummary } from '@/lib/conexa/tasks'

export type ConexaThreadSummaryHandle = { regenerate: () => void }

type Props = {
  taskId: string
  commentsCount: number
  commentsHash: string
  lastActivityAt: Date | null
  userId: string | null
  onDraftReply: (text: string) => void
  onProposeSubtasks: (items: ThreadSummary['proposedSubtasks']) => void
}

const CONTAINER = 'mb-[18px] rounded-xl border border-[var(--task-sum-border)] bg-[var(--task-sum-bg)] p-3.5'
const LABEL = 'text-[11px] font-bold uppercase tracking-[.06em] text-[var(--task-sum-label)]'
const META = 'text-[11px] text-[var(--task-sum-meta)]'
const LINK_BUTTON = 'text-[11px] font-semibold text-[var(--task-sum-label)] hover:underline'

function hiddenKey(userId: string | null, taskId: string) {
  return `conexa-summary-hidden:${userId ?? 'anon'}:${taskId}`
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function emphasize(text: string, items: string[]): ReactNode[] {
  if (items.length === 0) return [text]
  const escaped = items.map(i => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  return text.split(pattern).map((part, i) =>
    items.some(item => item.toLowerCase() === part.toLowerCase()) ? (
      <strong key={i} className="font-semibold text-[var(--task-sum-strong)]">
        {part}
      </strong>
    ) : (
      part
    ),
  )
}

function knownSentence(s: ThreadSummary) {
  const total = s.known.length + s.missing.length
  if (s.known.length === 0) return null
  const facts = s.known.map(k => `${k.item}: ${k.value} (${k.source})`).join(' · ')
  const missing = s.missing.length ? ` Falta confirmar: ${s.missing.join(', ')}.` : ''
  return `Ya tengo ${s.known.length} de ${total}: ${facts}.${missing}`
}

export const ConexaThreadSummary = forwardRef<ConexaThreadSummaryHandle, Props>(function ConexaThreadSummary(
  { taskId, commentsCount, commentsHash, lastActivityAt, userId, onDraftReply, onProposeSubtasks },
  ref,
) {
  const enabled = commentsCount >= MIN_COMMENTS_FOR_SUMMARY
  const { data, error, isLoading, regenerate } = useThreadSummary(taskId, commentsHash, enabled)
  const containerRef = useRef<HTMLElement>(null)

  const [hiddenFor, setHiddenFor] = useState<string | null>(null)
  useEffect(() => {
    setHiddenFor(window.localStorage.getItem(hiddenKey(userId, taskId)))
  }, [userId, taskId])
  const collapsed = hiddenFor === commentsHash

  const setCollapsed = (value: boolean) => {
    const key = hiddenKey(userId, taskId)
    if (value) window.localStorage.setItem(key, commentsHash)
    else window.localStorage.removeItem(key)
    setHiddenFor(value ? commentsHash : null)
  }

  useImperativeHandle(ref, () => ({
    regenerate: () => {
      setCollapsed(false)
      void regenerate()
      requestAnimationFrame(() => containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    },
  }))

  if (!enabled) return null

  if (collapsed) {
    return (
      <section ref={containerRef} aria-label="Resumen de Conexa" className="mb-[18px] flex items-center justify-between gap-2">
        <span className={LABEL}>{'✦ Resumen de Conexa'}</span>
        <button type="button" onClick={() => setCollapsed(false)} className={LINK_BUTTON}>
          Mostrar
        </button>
      </section>
    )
  }

  if (isLoading && !data) {
    return (
      <section ref={containerRef} aria-busy="true" aria-label="Resumen de Conexa" className={CONTAINER}>
        <p className={`${LABEL} mb-2`}>{'✦ Resumen de Conexa'}</p>
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-[var(--task-sum-border)]" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--task-sum-border)]" />
        </div>
        <p className={`${META} mt-2`}>{'Conexa está leyendo el hilo…'}</p>
      </section>
    )
  }

  if (error && !data) {
    return (
      <section ref={containerRef} aria-label="Resumen de Conexa" className={`${CONTAINER} flex items-center gap-1.5`}>
        <span className="text-[13px] text-[var(--task-sum-text)]">No pudimos generar el resumen</span>
        <span className={META} aria-hidden="true">·</span>
        <button type="button" onClick={() => void regenerate()} className={LINK_BUTTON}>
          Reintentar
        </button>
      </section>
    )
  }

  if (!data) return null

  if (data.openAsks.length === 0) {
    const days = data.unansweredDays ?? (lastActivityAt ? Math.floor((Date.now() - lastActivityAt.getTime()) / 86_400_000) : 0)
    return (
      <section ref={containerRef} aria-label="Resumen de Conexa" className={`${CONTAINER} flex items-center justify-between gap-2`}>
        <p className="min-w-0 truncate text-[13px] text-[var(--task-sum-text)]">
          <span className={`${LABEL} mr-2`}>✦</span>
          {`Sin pendientes en el hilo. Última actividad hace ${plural(days, 'día', 'días')}.`}
        </p>
        <button type="button" onClick={() => setCollapsed(true)} className={LINK_BUTTON}>
          Ocultar
        </button>
      </section>
    )
  }

  const known = knownSentence(data)

  return (
    <section ref={containerRef} aria-label="Resumen de Conexa" className={CONTAINER}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={LABEL}>{'✦ Resumen de Conexa'}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className={META}>
            {`${plural(data.commentsCount, 'comentario', 'comentarios')} · ${plural(data.spanDays, 'día', 'días')}`}
          </span>
          <button type="button" onClick={() => setCollapsed(true)} className={LINK_BUTTON}>
            Ocultar
          </button>
        </div>
      </div>

      <div className="text-[13px] leading-[1.55] text-[var(--task-sum-text)] text-pretty">
        {data.openAsks.map((ask, i) => (
          <p key={i}>{emphasize(ask.text, ask.items)}</p>
        ))}
        {data.unansweredDays != null && data.unansweredDays > 0 && (
          <p>{`Nadie respondió en ${plural(data.unansweredDays, 'día', 'días')}.`}</p>
        )}
      </div>

      {known && <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--task-sum-known)] text-pretty">{known}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {data.draftReply && (
          <button
            type="button"
            onClick={() => onDraftReply(data.draftReply)}
            className="h-7 rounded-full bg-[#5B5FE8] px-3 text-[12px] font-semibold text-[#FFFFFF] transition-[filter] hover:brightness-110"
          >
            Responder con lo que ya sé
          </button>
        )}
        {data.proposedSubtasks.length > 0 && (
          <button
            type="button"
            onClick={() => onProposeSubtasks(data.proposedSubtasks)}
            className="h-7 rounded-full border border-[var(--task-sum-border)] bg-transparent px-3 text-[12px] font-semibold text-[var(--task-sum-secondary)] transition-colors hover:bg-[var(--task-sum-border)]/40"
          >
            Convertir en subtareas
          </button>
        )}
      </div>
    </section>
  )
})
