'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, LoaderCircle, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ContextAssessment } from '@/lib/conexa/copilot/client-profile'

export const COMPLETE_CONTEXT_MESSAGE = 'Ayudame a completar el contexto del cliente. Preguntame lo que falta de a uno o dos datos por vez.'

const LEVEL_STYLE = {
  debil: { label: 'Débil', badge: 'bg-primary/10 text-destructive', bar: 'bg-[#e5533d]', segments: 1 },
  intermedio: { label: 'Intermedio', badge: 'bg-[#fff4e5] text-primary', bar: 'bg-[#f59e0b]', segments: 2 },
  completo: { label: 'Completo', badge: 'bg-status-verde/10 text-status-verde', bar: 'bg-[#22a05a]', segments: 3 },
} as const

export type CompetitorControls = { suggesting: boolean; onSuggest: () => Promise<unknown>; onAdd: (name: string) => Promise<unknown>; onRemove: (noteId: string) => Promise<unknown> }

function CompetitorEditor({ assessment, controls }: { assessment: ContextAssessment; controls: CompetitorControls }) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const run = async (key: string, task: () => Promise<unknown>, success?: string) => {
    setPending(key)
    try { await task(); if (success) toast.success(success) } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la competencia') } finally { setPending(null) }
  }
  const searching = controls.suggesting || pending === 'suggest'
  const canSuggest = assessment.level !== 'debil'
  return <section aria-labelledby="competitors-title" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5">
    <div className="flex items-center justify-between gap-2">
      <h3 id="competitors-title" className="text-[11px] font-semibold text-foreground">Competencia</h3>
      <Button type="button" variant="ghost" size="sm" disabled={searching || !canSuggest || Boolean(pending)} title={canSuggest ? undefined : 'Completá los datos base para buscar competidores'} onClick={() => run('suggest', controls.onSuggest)} className="h-6 gap-1 px-1.5 text-[10px] text-primary hover:bg-primary/10 hover:text-primary">{searching ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3" aria-hidden="true" />}{searching ? 'Buscando…' : 'Sugerir con IA'}</Button>
    </div>
    {searching && !assessment.competitorEntries.length && <p role="status" className="text-[10px] text-muted-foreground">Conexa está buscando competidores en la web…</p>}
    {!searching && !assessment.competitorEntries.length && <p className="text-[10px] italic text-muted-foreground">{canSuggest ? 'Sin competidores todavía.' : 'Completá industria, objetivo y qué vende para que Conexa los busque.'}</p>}
    {assessment.competitorEntries.length > 0 && <ul className="flex flex-col gap-1.5">{assessment.competitorEntries.map((entry) => <li key={entry.noteId} className="flex items-start gap-2 rounded-md bg-muted px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">{entry.name}{entry.suggested && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">IA</span>}</span>
        {entry.detail && <span className="text-[10px] leading-snug text-muted-foreground">{entry.detail.replace(/^Sugerido por Conexa\s*—\s*/, '')}</span>}
      </div>
      <button type="button" onClick={() => run(entry.noteId, () => controls.onRemove(entry.noteId))} disabled={Boolean(pending)} aria-label={`Quitar ${entry.name}`} title="No es competidor" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">{pending === entry.noteId ? <LoaderCircle className="size-3 animate-spin" /> : <X className="size-3" />}</button>
    </li>)}</ul>}
    <form onSubmit={(event) => { event.preventDefault(); const value = name.trim(); if (value.length < 2) return; void run('add', async () => { await controls.onAdd(value); setName('') }) }} className="flex items-center gap-1.5">
      <label htmlFor="competitor-name" className="sr-only">Agregar competidor</label>
      <Input id="competitor-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Agregar competidor…" className="h-7 border-border bg-card text-[11px] text-foreground" />
      <Button type="submit" variant="outline" size="sm" disabled={name.trim().length < 2 || Boolean(pending)} className="h-7 shrink-0 border-border bg-card px-2 text-[10px] text-foreground hover:bg-muted hover:text-foreground">{pending === 'add' ? <LoaderCircle className="size-3 animate-spin" /> : 'Agregar'}</Button>
    </form>
    {assessment.discardedCompetitors.length > 0 && <p className="text-[9px] leading-relaxed text-muted-foreground">Descartados (no se vuelven a sugerir): {assessment.discardedCompetitors.join(', ')}</p>}
  </section>
}

export function ContextStatus({ assessment, unavailable, busy, competitors, onAddManual, onComplete }: { assessment: ContextAssessment | null; unavailable: boolean; busy: boolean; competitors: CompetitorControls; onAddManual: () => void; onComplete: () => void }) {
  const [open, setOpen] = useState(false)
  const style = assessment ? LEVEL_STYLE[assessment.level] : null
  const formatValue = (value: string | number | null) => (typeof value === 'number' ? value.toLocaleString('es-AR') : String(value ?? '').replace(/_/g, ' '))
  return <div className="shrink-0 border-b border-border">
    <div className="flex items-center gap-2 px-3 py-2">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="context-status-detail" className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left">
        <span className="text-[11px] font-semibold text-foreground">Contexto</span>
        {style ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', style.badge)}>{style.label}</span> : unavailable ? <span className="text-[10px] text-muted-foreground">No disponible</span> : <Skeleton className="h-4 w-14 rounded-full" />}
        {style && <span className="flex items-center gap-0.5" aria-hidden="true">{[1, 2, 3].map((segment) => <span key={segment} className={cn('h-1.5 w-4 rounded-full', segment <= style.segments ? style.bar : 'bg-muted')} />)}</span>}
        {competitors.suggesting && <span role="status" className="flex items-center gap-1 truncate text-[10px] text-muted-foreground"><LoaderCircle className="size-3 shrink-0 animate-spin text-primary" aria-hidden="true" />Buscando competidores</span>}
        <ChevronDown className={cn('ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <Button type="button" variant="outline" size="sm" onClick={onAddManual} className="h-7 shrink-0 px-2 text-[10px]">+ Contexto</Button>
    </div>
    {!open && assessment && assessment.competitorEntries.length > 0 && <div className="flex flex-wrap items-center gap-1 px-3 pb-2" aria-label="Competidores guardados en el contexto">
      <span className="text-[10px] text-muted-foreground">Competencia:</span>
      {assessment.competitorEntries.slice(0, 4).map((entry) => <span key={entry.noteId} className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{entry.name}</span>)}
      {assessment.competitorEntries.length > 4 && <span className="text-[10px] text-muted-foreground">+{assessment.competitorEntries.length - 4}</span>}
    </div>}
    {open && assessment && <div id="context-status-detail" className="flex flex-col gap-3 border-t border-border bg-muted px-3 py-3">
      <ul className="flex flex-col gap-1.5">
        {assessment.fields.map((field) => <li key={field.key} className="flex items-start gap-2 text-[11px] leading-snug">
          {field.filled ? <Check className="mt-0.5 size-3 shrink-0 text-[#22a05a]" aria-label="Cargado" /> : <span className="mt-1 size-2 shrink-0 rounded-full border border-border" aria-label="Falta" />}
          <span className="w-28 shrink-0 text-muted-foreground">{field.label}{field.core && <span className="sr-only"> (obligatorio)</span>}</span>
          <span className={cn('min-w-0 flex-1 break-words', field.filled ? 'text-foreground' : 'italic text-muted-foreground')}>{field.filled ? formatValue(field.value) : 'Falta'}</span>
        </li>)}
      </ul>
      <CompetitorEditor assessment={assessment} controls={competitors} />
      <p className="text-[10px] leading-relaxed text-muted-foreground">{assessment.notesCount} nota(s) de contexto guardadas. Lo que confirmes en el chat se guarda en el formulario Contexto del cliente.</p>
      {assessment.level !== 'completo' && <Button type="button" size="sm" disabled={busy} onClick={() => { setOpen(false); onComplete() }} className="h-8 self-start bg-primary px-3 text-[11px] text-background hover:bg-primary"><Sparkles className="size-3.5" />Completar con Conexa</Button>}
    </div>}
  </div>
}
