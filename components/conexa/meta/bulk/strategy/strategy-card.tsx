'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Sparkles } from 'lucide-react'
import type { CreativeCard } from '@/lib/meta/to-creative-card'
import { relativeTime, strategyCounts, type StrategyRun } from '@/lib/conexa/agents/creative-strategy-types'
import { StrategyDrawer } from './strategy-drawer'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No pudimos leer la estrategia')
  return (await res.json()) as { run: StrategyRun | null }
}

type Props = { clientId: string; clientName: string; destinationUrl?: string | null; creatives: CreativeCard[] }

export function StrategyCard({ clientId, clientName, destinationUrl, creatives }: Props) {
  const [open, setOpen] = useState(false)
  const [sessionRun, setSessionRun] = useState<StrategyRun | null>(null)
  const { data, isLoading, mutate } = useSWR(`/api/conexa/agents/creative-strategy/latest?clientId=${clientId}`, fetcher, { revalidateOnFocus: false })
  const run = sessionRun ?? data?.run ?? null
  const counts = run ? strategyCounts(run) : null

  function handleRunChange(next: StrategyRun) {
    setSessionRun(next)
    if (next.persisted) mutate({ run: next }, { revalidate: false })
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#dcdcd8] bg-white p-4 text-[#141414]" aria-labelledby="strategy-card-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FF7F00]/10">
            <Sparkles className="size-4 text-[#FF7F00]" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h3 id="strategy-card-title" className="text-[13px] font-semibold">Estrategia de creativos</h3>
            <p className="text-pretty text-[11.5px] leading-relaxed text-[#777]">
              {run
                ? `Última ejecución${run.createdByName ? ` por ${run.createdByName}` : ''} · ${relativeTime(run.createdAt)}`
                : 'Conexa arma buyer personas, dolores y 3 creativos por persona pensados para Andrómeda.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-[#141414] px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#333]"
        >
          {run ? 'Ver estrategia' : 'Armar estrategia'}
        </button>
      </div>

      {isLoading && !run && <p className="text-[11px] text-[#999]">Buscando la última ejecución…</p>}

      {counts && (
        <dl className="grid grid-cols-3 gap-2 border-t border-[#f0f0ed] pt-3">
          {[
            ['Personas', counts.personas],
            ['Creativos', counts.creatives],
            ['En diseño', counts.inDesign],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-[10.5px] text-[#999]">{label}</dt>
              <dd className="font-mono text-[15px] font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <StrategyDrawer
        open={open}
        onOpenChange={setOpen}
        clientId={clientId}
        clientName={clientName}
        destinationUrl={destinationUrl}
        creatives={creatives}
        run={run}
        onRunChange={handleRunChange}
      />
    </section>
  )
}
