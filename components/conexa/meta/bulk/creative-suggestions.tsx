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
    <article className="flex flex-col overflow-hidden rounded-[14px] border border-[#E6E6E3] bg-white">
      <div className="flex h-[100px] items-center justify-center gap-3 bg-[#5B5FE8]/5" aria-hidden="true">
        {suggestion.ratios.map((ratio) => (
          <div key={ratio} className={`flex items-center justify-center rounded-md border border-dashed border-[#5B5FE8]/50 ${SILHOUETTE[ratio]}`}>
            <span className="font-mono text-[9px] text-[#5B5FE8]">{ratio}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-[14px]">
        <p className="font-mono text-[10.5px] text-[#777]">{suggestion.format}</p>
        <h4 className="text-pretty text-[13.5px] font-bold text-[#141414]">{suggestion.title}</h4>
        <p className="text-[12px] italic leading-relaxed text-[#444]">{suggestion.hook}</p>
        <p className="text-[12px] leading-relaxed text-[#5C5C5C]">{suggestion.copy}</p>
        <div className="mt-auto rounded-lg bg-[#f7f7f5] p-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#999]">Basado en</p>
          <p className="text-[11.5px] leading-relaxed text-[#444]">{suggestion.basis}</p>
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onAdd} className="h-8 flex-1 rounded-full bg-[#5B5FE8] text-[11px] text-white hover:bg-[#4b4fd6]">
            <Plus className="size-3.5" aria-hidden="true" />
            Agregar al lote
          </Button>
          <Button size="sm" variant="outline" onClick={sendBrief} disabled={briefSent || sending} className="h-8 flex-1 rounded-full border-[#dcdcd8] bg-white text-[11px] text-[#333] hover:bg-[#f5f5f3] hover:text-[#141414]">
            {briefSent ? <><Check className="size-3.5 text-[#1e9e6b]" aria-hidden="true" />Brief enviado</> : sending ? 'Enviando…' : 'Crear brief'}
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
        <h2 id="conexa-suggestions-title" className="text-[13px] font-semibold text-[#141414]"><ConexaMark />{' sugiere producir'}</h2>
        <Button size="sm" variant="outline" onClick={onGoToBulk} className="h-8 rounded-full border-[#5B5FE8]/40 bg-white px-4 text-[11px] text-[#5B5FE8] hover:bg-[#5B5FE8]/5 hover:text-[#5B5FE8]">
          <Upload className="size-3.5" aria-hidden="true" />
          Carga masiva
        </Button>
      </div>
      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => <div key={item} className="h-[320px] animate-pulse rounded-[14px] border border-[#E6E6E3] bg-[#f7f7f5]" />)}
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
    <section className="rounded-xl border border-[#5B5FE8]/30 bg-white p-4" aria-labelledby="compact-suggestions-title">
      <h3 id="compact-suggestions-title" className="mb-3 text-[12px] font-semibold text-[#141414]"><ConexaMark />{' sugiere sumar al lote'}</h3>
      {isLoading || !data ? (
        <p className="text-[11px] text-[#999]">Analizando los creativos activos…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#f0f0ed]">
          {data.map((suggestion) => {
            const added = rows.some((row) => row.fromSuggestion === suggestion.id)
            return (
              <li key={suggestion.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="font-mono text-[10px] text-[#777]">{suggestion.format}</p>
                <p className="text-[12.5px] font-semibold text-[#141414]">{suggestion.title}</p>
                <p className="text-[11px] leading-relaxed text-[#777]">{`Basado en: ${suggestion.basis}`}</p>
                <button type="button" disabled={added} onClick={() => addSuggestion(suggestion)} className="self-start text-[11px] font-semibold text-[#5B5FE8] hover:underline disabled:text-[#1e9e6b] disabled:no-underline">
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
