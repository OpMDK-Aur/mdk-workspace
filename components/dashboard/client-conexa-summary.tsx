'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MAX_CUSTOM_FOCUS,
  SUMMARY_FOCUS_PRESETS,
  SUMMARY_PERIODS,
  type ClientManagementSummary,
  type SummaryItem,
  type SummaryPeriod,
} from '@/lib/conexa/client-summary-types'

const LABEL = 'text-[11px] font-bold uppercase tracking-[.06em] text-[var(--task-sum-label)]'
const META = 'text-[11px] text-[var(--task-sum-meta)]'
const TEXT = 'text-[13px] leading-[1.55] text-[var(--task-sum-text)] text-pretty'

const STATE_LABELS: Record<string, string> = {
  pendiente: 'pendientes',
  en_progreso: 'en progreso',
  resolviendo: 'resolviendo',
  revision: 'en revisión',
  completada: 'completadas',
}

function Section({ title, items }: { title: string; items: SummaryItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className={LABEL}>{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className={cn(TEXT, 'flex gap-2')}>
            <span aria-hidden="true" className="text-[var(--task-sum-meta)]">
              {'·'}
            </span>
            <span>
              {item.text}
              {item.taskId && (
                <>
                  {' '}
                  <Link
                    href={`/dashboard/tasks?task=${item.taskId}`}
                    className="text-[11px] font-semibold text-[var(--task-sum-label)] hover:underline"
                  >
                    Ver tarea
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ClientConexaSummary({ clientId }: { clientId: string }) {
  const [focus, setFocus] = useState<string>('todo')
  const [customFocus, setCustomFocus] = useState('')
  const [period, setPeriod] = useState<SummaryPeriod>('90')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ClientManagementSummary | null>(null)

  const effectiveFocus = focus === 'custom' ? customFocus.trim() : focus

  async function generate(force = false) {
    if (!effectiveFocus) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/conexa/clients/${clientId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus: effectiveFocus, period, force }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'No pudimos generar el resumen')
      setData(json as ClientManagementSummary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos generar el resumen')
    } finally {
      setLoading(false)
    }
  }

  const stateLine = data
    ? Object.entries(data.byState)
        .map(([state, n]) => `${n} ${STATE_LABELS[state] ?? state}`)
        .join(' · ')
    : ''

  return (
    <section
      aria-label="Resumen de gestión de Conexa"
      className="flex flex-col gap-3 rounded-xl border border-[var(--task-sum-border)] bg-[var(--task-sum-bg)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={LABEL}>{'✦ Conexa · Resumen de gestión'}</h2>
        <label className="flex items-center gap-2">
          <span className="sr-only">Período</span>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as SummaryPeriod)}
            className="h-7 rounded-md border border-[var(--task-sum-border)] bg-transparent px-2 text-[12px] text-[var(--task-sum-text)]"
          >
            {SUMMARY_PERIODS.map(p => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Enfoque del resumen">
        {[...SUMMARY_FOCUS_PRESETS, { value: 'custom', label: 'Otro…' }].map(p => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={focus === p.value}
            onClick={() => setFocus(p.value)}
            className={cn(
              'h-7 rounded-full border px-3 text-[12px] font-medium transition-colors',
              focus === p.value
                ? 'border-[var(--task-sum-label)] bg-[var(--task-sum-label)] text-[var(--task-sum-bg)]'
                : 'border-[var(--task-sum-border)] text-[var(--task-sum-text)] hover:border-[var(--task-sum-label)]',
            )}
          >
            {p.label}
          </button>
        ))}
        {focus === 'custom' && (
          <input
            autoFocus
            value={customFocus}
            maxLength={MAX_CUSTOM_FOCUS}
            onChange={e => setCustomFocus(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              void generate()
            }}
            placeholder="Ej: landings, CRM, SEO"
            aria-label="Enfoque personalizado"
            className="h-7 min-w-40 flex-1 rounded-md border border-[var(--task-sum-border)] bg-transparent px-2 text-[12px] text-[var(--task-sum-text)] placeholder:text-[var(--task-sum-meta)]"
          />
        )}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading || !effectiveFocus}
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--task-sum-label)] px-3 text-[12px] font-semibold text-[var(--task-sum-bg)] disabled:opacity-50"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {loading ? 'Resumiendo…' : 'Resumir'}
        </button>
      </div>

      {error && (
        <p role="alert" className={TEXT}>
          {error}
        </p>
      )}

      {!data && !error && !loading && (
        <p className={META}>Elegí un área y Conexa resume las tareas y comentarios del cliente.</p>
      )}

      {data && (
        <div aria-live="polite" className="flex flex-col gap-3 border-t border-[var(--task-sum-border)] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={META}>
              {`${data.focusLabel} · ${data.tasksConsidered} de ${data.tasksTotal} tareas`}
              {stateLine && ` · ${stateLine}`}
            </p>
            <button
              type="button"
              onClick={() => void generate(true)}
              disabled={loading}
              className="text-[11px] font-semibold text-[var(--task-sum-label)] hover:underline disabled:opacity-50"
            >
              Regenerar
            </button>
          </div>
          <p className={TEXT}>{data.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="Hecho" items={data.done} />
            <Section title="En curso" items={data.inProgress} />
            <Section title="Bloqueos" items={data.blockers} />
            <Section title="Próximos pasos" items={data.nextSteps} />
          </div>
        </div>
      )}
    </section>
  )
}
