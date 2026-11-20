'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Check, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createDesignBrief, getCreativeSuggestions } from '@/lib/bulk/api'
import { useBulkStore } from '@/lib/bulk/store'
import type { CreativeSuggestion, Ratio } from '@/lib/bulk/types'
import type { CreativeCard } from '@/lib/meta/to-creative-card'
import { ConexaMark } from './bulk-shared'

const SILHOUETTE: Record<Ratio, string> = { '9:16': 'h-[72px] w-[40px]', '4:5': 'h-[64px] w-[51px]', '1:1': 'h-[56px] w-[56px]', '1.91:1': 'h-[40px] w-[76px]' }

export function useCreativeSuggestions(clientId: string, creatives: CreativeCard[]) {
  return useSWR(['creative-suggestions', clientId, creatives.length], () => getCreativeSuggestions({ clientId, creatives }), { revalidateOnFocus: false })
}

function SuggestionCard({ suggestion, clientId, onAdd }: { suggestion: CreativeSuggestion; clientId: string; onAdd: () => void }) {
  const briefSent = useBulkStore((state) => state.briefsSent.includes(suggestion.id))
  const markBriefSent = useBulkStore((state) => state.markBriefSent)
  const [sending, setSending] = useState(false)

  async function sendBrief() {
    setSending(true)
    await createDesignBrief({ clientId, suggestion })
    markBriefSent(suggestion.id)
    setSending(false)
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="flex h-[100px] items-center justify-center gap-3 bg-primary/5" aria-hidden="true">
        {suggestion.ratios.map((ratio) => (
          <div key={ratio} className={`flex items-center justify-center rounded-md border border-dashed border-primary/50 ${SILHOUETTE[ratio]}`}>
            <span className="font-mono text-[9px] text-primary">{ratio}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-[14px]">
        <p className="font-mono text-[10.5px] text-muted-foreground">{suggestion.format}</p>
        <h4 className="text-pretty text-[13.5px] font-bold text-foreground">{suggestion.title}</h4>
        <p className="text-[12px] italic leading-relaxed text-muted-foreground">{suggestion.hook}</p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">{suggestion.copy}</p>
        <div className="mt-auto rounded-lg bg-muted p-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Basado en</p>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">{suggestion.basis}</p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onAdd} className="h-8 flex-1 rounded-full bg-primary text-[11px] text-primary-foreground hover:bg-[#4b4fd6]">
            <Plus className="size-3.5" aria-hidden="true" />
            Agregar al lote
          </Button>
          <Button size="sm" variant="outline" onClick={sendBrief} disabled={briefSent || sending} className="h-8 flex-1 rounded-full border-border bg-card text-[11px] text-foreground hover:bg-muted hover:text-foreground">
            {briefSent ? <><Check className="size-3.5 text-status-verde" aria-hidden="true" />Brief enviado</> : sending ? 'Enviando…' : 'Crear brief'}
          </Button>
        </div>
      </div>
    </article>
  )
}

export function CreativeSuggestionsSection({ clientId, creatives, onGoToBulk }: { clientId: string; creatives: CreativeCard[]; onGoToBulk: () => void }) {
  const { data, isLoading } = useCreativeSuggestions(clientId, creatives)
  const addSuggestion = useBulkStore((state) => state.addSuggestion)
  const setStep = useBulkStore((state) => state.setStep)

  function add(suggestion: CreativeSuggestion) {
    addSuggestion(suggestion)
    setStep(2)
    onGoToBulk()
  }

  return (
    <section className="mb-6" aria-labelledby="conexa-suggestions-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="conexa-suggestions-title" className="text-[13px] font-semibold text-foreground"><ConexaMark />{' sugiere producir'}</h2>
        <Button size="sm" variant="outline" onClick={onGoToBulk} className="h-8 rounded-full border-primary/40 bg-card px-4 text-[11px] text-primary hover:bg-primary/5 hover:text-primary">
          <Upload className="size-3.5" aria-hidden="true" />
          Carga masiva
        </Button>
      </div>
      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => <div key={item} className="h-[320px] animate-pulse rounded-[14px] border border-border bg-muted" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-3">
          {data.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} clientId={clientId} onAdd={() => add(suggestion)} />)}
        </div>
      )}
    </section>
  )
}

export function CompactSuggestions({ clientId, creatives }: { clientId: string; creatives: CreativeCard[] }) {
  const { data, isLoading } = useCreativeSuggestions(clientId, creatives)
  const rows = useBulkStore((state) => state.rows)
  const addSuggestion = useBulkStore((state) => state.addSuggestion)

  return (
    <section className="rounded-xl border border-primary/30 bg-card p-4" aria-labelledby="compact-suggestions-title">
      <h3 id="compact-suggestions-title" className="mb-3 text-[12px] font-semibold text-foreground"><ConexaMark />{' sugiere sumar al lote'}</h3>
      {isLoading || !data ? (
        <p className="text-[11px] text-muted-foreground">Analizando los creativos activos…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.map((suggestion) => {
            const added = rows.some((row) => row.fromSuggestion === suggestion.id)
            return (
              <li key={suggestion.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="font-mono text-[10px] text-muted-foreground">{suggestion.format}</p>
                <p className="text-[12.5px] font-semibold text-foreground">{suggestion.title}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{`Basado en: ${suggestion.basis}`}</p>
                <button type="button" disabled={added} onClick={() => addSuggestion(suggestion)} className="self-start text-[11px] font-semibold text-primary hover:underline disabled:text-status-verde disabled:no-underline">
                  {added ? '✓ En el lote' : '+ Agregar al lote'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
