'use client'

import { useState } from 'react'
import { Check, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanAnswer, PlanQuestion } from '@/lib/conexa/bulk/types'

const inputClass = 'min-w-0 flex-1 rounded-md border border-[#e5e5e0] bg-white px-2 py-1 text-[12px] text-[#141414] outline-none focus:border-[#5B5FE8]'
const chipClass = 'rounded-full border px-2.5 py-1 text-left text-[11.5px] transition-colors'

const rowsLabel = (rows: number[]) => (rows.length === 1 ? `Fila ${rows[0]}` : `Filas ${rows.slice(0, 6).join(', ')}${rows.length > 6 ? ` y ${rows.length - 6} más` : ''}`)
const questionDomId = (id: string) => `plan-question-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
const isComposing = (event: React.KeyboardEvent) => event.nativeEvent.isComposing || event.keyCode === 229

function FreeAnswer({ placeholder, initial, onSubmit }: { placeholder: string; initial?: string; onSubmit: (text: string) => void }) {
  const [text, setText] = useState(initial ?? '')
  const submit = () => text.trim() && onSubmit(text.trim())
  return (
    <div className="flex items-center gap-2">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !isComposing(event)) submit()
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={inputClass}
      />
      <button type="button" onClick={submit} disabled={!text.trim()} className="rounded-full bg-[#141414] px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40">
        Responder
      </button>
    </div>
  )
}

function QuestionBody({ question, onAnswer }: { question: PlanQuestion; onAnswer: (answer: PlanAnswer) => void }) {
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<string[]>(question.answer?.values ?? [])

  if (question.kind === 'text') {
    return <FreeAnswer placeholder={question.freePlaceholder} initial={question.answer?.text ?? question.suggestion} onSubmit={(text) => onAnswer({ text })} />
  }

  const query = filter.trim().toLowerCase()
  const options = query ? question.options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(query)) : question.options
  const multi = question.kind === 'multi'

  return (
    <div className="flex flex-col gap-2">
      {question.searchable && <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar…" aria-label={`Buscar opciones para ${question.field}`} className={inputClass} />}
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto" role={multi ? 'group' : 'radiogroup'} aria-label={question.prompt}>
        {options.map((option) => {
          const selected = multi ? picked.includes(option.value) : question.answer?.value === option.value
          const suggested = question.suggestion === option.value
          return (
            <button
              key={option.value}
              type="button"
              role={multi ? undefined : 'radio'}
              aria-checked={multi ? undefined : selected}
              aria-pressed={multi ? selected : undefined}
              onClick={() => (multi ? setPicked((current) => (current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value])) : onAnswer({ value: option.value }))}
              className={cn(chipClass, selected ? 'border-[#5B5FE8] bg-[#5B5FE8]/10 text-[#4347c9]' : suggested ? 'border-[#5B5FE8]/50 text-[#141414]' : 'border-[#e5e5e0] text-[#333] hover:border-[#141414]')}
            >
              <span className="font-medium">{option.label}</span>
              {option.hint && <span className="text-[#888]">{` · ${option.hint}`}</span>}
              {suggested && !selected && <span className="text-[#5B5FE8]">{' · sugerido'}</span>}
            </button>
          )
        })}
        {!options.length && <span className="text-[11px] text-[#999]">Ninguna opción coincide.</span>}
      </div>
      {multi && (
        <button type="button" disabled={!picked.length} onClick={() => onAnswer({ values: picked })} className="self-start rounded-full bg-[#141414] px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40">
          {picked.length ? `Usar ${picked.length} seleccionado${picked.length > 1 ? 's' : ''}` : 'Elegí al menos uno'}
        </button>
      )}
      {question.allowFree && <FreeAnswer placeholder={question.freePlaceholder} initial={question.answer?.text} onSubmit={(text) => onAnswer({ text })} />}
    </div>
  )
}

function QuestionCard({ question, onAnswer, onReset }: { question: PlanQuestion; onAnswer: (answer: PlanAnswer) => void; onReset: () => void }) {
  if (question.answered) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-4 py-2">
        <Check className="size-3.5 shrink-0 text-[#1e9e6b]" aria-hidden="true" />
        <span className="text-[11.5px] text-[#777]">{`${question.field} · ${rowsLabel(question.rowNumbers)}:`}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#141414]">{question.answerLabel ?? question.answer?.text ?? question.answer?.value}</span>
        <button type="button" onClick={onReset} className="text-[11px] text-[#777] underline-offset-2 hover:text-[#141414] hover:underline">Cambiar</button>
      </li>
    )
  }
  return (
    <li id={questionDomId(question.id)} tabIndex={-1} data-pending-question className="flex scroll-mt-4 flex-col gap-2 px-4 py-3 outline-none focus-visible:bg-[#fdf9f0]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="rounded-full bg-[#fdf3e3] px-2 py-0.5 text-[10.5px] font-semibold text-[#8a5f0d]">{question.field}</span>
        <span className="text-[11px] text-[#999]">{rowsLabel(question.rowNumbers)}</span>
      </div>
      <p className="text-pretty text-[12.5px] font-medium leading-relaxed text-[#141414]">{question.prompt}</p>
      <p className="text-pretty text-[11px] leading-relaxed text-[#777]">{question.why}</p>
      {question.note && <p className="text-[11px] text-[#8a5f0d]">{question.note}</p>}
      <QuestionBody question={question} onAnswer={onAnswer} />
      {question.reuse && <p className="text-[10.5px] text-[#999]">{question.reuse.kind === 'alias' ? `Se recuerda para "${question.reuse.alias}" en próximas cargas.` : `Se recuerda qué significa "${question.reuse.value}" en este sheet.`}</p>}
    </li>
  )
}

export function PlanQuestions({ questions, onAnswer }: { questions: PlanQuestion[]; onAnswer: (id: string, answer: PlanAnswer | undefined) => void }) {
  if (!questions.length) return null
  const pending = questions.filter((question) => !question.answered)
  const answered = questions.filter((question) => question.answered)
  // Va a la primera pendiente que quede debajo de la vista; si no hay, vuelve a la primera.
  const goToNext = () => {
    const nodes = pending.map((question) => document.getElementById(questionDomId(question.id))).filter((node): node is HTMLElement => Boolean(node))
    const target = nodes.find((node) => node.getBoundingClientRect().top > 80) ?? nodes[0]
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
  }
  return (
    <section className="rounded-xl border border-[#f0e2c2] bg-white" aria-labelledby="plan-questions-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0ed] px-4 py-2.5">
        <h3 id="plan-questions-title" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#141414]">
          <HelpCircle className="size-4 text-[#c98a16]" aria-hidden="true" />
          {pending.length ? `${pending.length} pregunta${pending.length > 1 ? 's' : ''} pendiente${pending.length > 1 ? 's' : ''}` : 'Todas las preguntas respondidas'}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#999]">{`${answered.length}/${questions.length} respondidas`}</span>
          {pending.length > 0 && (
            <button type="button" onClick={goToNext} className="rounded-full border border-[#141414] px-3 py-1 text-[11px] font-medium text-[#141414] hover:bg-[#141414] hover:text-white">
              Ir a la siguiente
            </button>
          )}
        </div>
      </header>
      <ul className="divide-y divide-[#f3f3f0]">
        {[...pending, ...answered].map((question) => (
          <QuestionCard key={question.id} question={question} onAnswer={(answer) => onAnswer(question.id, answer)} onReset={() => onAnswer(question.id, undefined)} />
        ))}
      </ul>
    </section>
  )
}
