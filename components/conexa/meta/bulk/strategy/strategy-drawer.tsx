'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { CreativeCard } from '@/lib/meta/to-creative-card'
import type { PersonasCount, StrategyInput, StrategyRun, StrategySources } from '@/lib/conexa/agents/creative-strategy-types'
import { StrategyResult } from './strategy-result'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  destinationUrl?: string | null
  creatives: CreativeCard[]
  run: StrategyRun | null
  onRunChange: (run: StrategyRun) => void
}

const SOURCES: { key: keyof StrategySources; label: string; detail: (metaCount: number) => string }[] = [
  { key: 'crm', label: 'Ganados del CRM', detail: () => 'Clientes cerrados del negocio' },
  { key: 'ga4', label: 'Analytics', detail: () => 'Páginas que convierten · 90 días' },
  { key: 'metaHistory', label: 'Histórico de Meta', detail: (count) => (count ? `${count} anuncios con resultados` : 'Sin anuncios cargados') },
  { key: 'competitors', label: 'Competencia', detail: () => 'Biblioteca de anuncios' },
]

function websiteFrom(url?: string | null) {
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

function metaTopAdsSummary(creatives: CreativeCard[]) {
  return [...creatives]
    .sort((a, b) => b.leads - a.leads || b.clicks - a.clicks)
    .slice(0, 8)
    .map((creative) => `"${creative.name}" (${creative.campaign}) · ${creative.leads} leads · ${creative.clicks} clics`)
    .join('; ')
}

export function StrategyDrawer({ open, onOpenChange, clientId, clientName, destinationUrl, creatives, run, onRunChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState<StrategyInput>(() => run?.input ?? {
    business: clientName,
    website: websiteFrom(destinationUrl),
    goal: '',
    personasCount: 3,
    sources: { crm: true, ga4: true, metaHistory: creatives.length > 0, competitors: false },
  })
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showForm = !run || editing

  async function handleRun(event: React.FormEvent) {
    event.preventDefault()
    if (!input.business.trim() || !input.goal.trim()) {
      setError('Completá el negocio y el objetivo.')
      return
    }
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/conexa/agents/creative-strategy/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          input,
          context: { metaTopAds: input.sources.metaHistory ? metaTopAdsSummary(creatives) : null },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No pudimos armar la estrategia')
      onRunChange(data as StrategyRun)
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos armar la estrategia')
    } finally {
      setRunning(false)
    }
  }

  const fieldClass = 'w-full rounded-lg border border-[#dcdcd8] bg-white px-3 py-2 text-[13px] text-[#141414] outline-none placeholder:text-[#aaa] focus-visible:border-[#5B5FE8] focus-visible:ring-2 focus-visible:ring-[#5B5FE8]/20'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-[#dcdcd8] bg-[#fafaf8] p-0 text-[#141414] sm:max-w-[680px]">
        <SheetHeader className="gap-1 border-b border-[#e8e8e4] bg-white px-6 py-4 text-left">
          <SheetTitle className="text-[15px] font-semibold text-[#141414]">Estrategia de creativos</SheetTitle>
          <SheetDescription className="text-[12px] text-[#777]">
            {showForm ? `Contale a Conexa sobre ${clientName || 'el cliente'} y elegí qué datos usar.` : 'Elegí los creativos y mandalos a diseño como tareas.'}
          </SheetDescription>
        </SheetHeader>

        {showForm ? (
          <form onSubmit={handleRun} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-[#555]">Negocio</span>
                  <input className={fieldClass} value={input.business} onChange={(event) => setInput({ ...input, business: event.target.value })} required />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] font-medium text-[#555]">Sitio web</span>
                  <input className={fieldClass} value={input.website} onChange={(event) => setInput({ ...input, website: event.target.value })} placeholder="https://" inputMode="url" />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-[#555]">Objetivo y clientes objetivo</span>
                <textarea
                  className={cn(fieldClass, 'min-h-[96px] resize-y leading-relaxed')}
                  value={input.goal}
                  onChange={(event) => setInput({ ...input, goal: event.target.value })}
                  placeholder="Ej. Generar consultas para salones de eventos. Apuntamos a parejas que se casan en 2027 y a empresas que organizan fiestas de fin de año."
                  required
                />
              </label>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[11.5px] font-medium text-[#555]">Cantidad de buyer personas</legend>
                <div className="flex gap-2">
                  {([3, 4, 5] as PersonasCount[]).map((count) => (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={input.personasCount === count}
                      onClick={() => setInput({ ...input, personasCount: count })}
                      className={cn('w-12 rounded-lg border py-1.5 font-mono text-[13px] font-semibold transition-colors', input.personasCount === count ? 'border-[#141414] bg-[#141414] text-white' : 'border-[#dcdcd8] bg-white text-[#555] hover:border-[#bbb]')}
                    >
                      {count}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#999]">{`${input.personasCount * 3} creativos en total (3 por persona).`}</p>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[11.5px] font-medium text-[#555]">Datos que usa Conexa</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SOURCES.map((source) => {
                    const checked = input.sources[source.key]
                    return (
                      <label key={source.key} className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg border bg-white px-3 py-2.5 transition-colors', checked ? 'border-[#5B5FE8]' : 'border-[#dcdcd8] hover:border-[#bbb]')}>
                        <input
                          type="checkbox"
                          className="mt-0.5 size-3.5 accent-[#5B5FE8]"
                          checked={checked}
                          onChange={(event) => setInput({ ...input, sources: { ...input.sources, [source.key]: event.target.checked } })}
                        />
                        <span className="flex flex-col">
                          <span className="text-[12px] font-semibold text-[#141414]">{source.label}</span>
                          <span className="text-[11px] text-[#888]">{source.detail(creatives.length)}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              {error && <p role="alert" className="rounded-lg bg-[#FF7F00]/10 px-3 py-2 text-[12px] text-[#a34f00]">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#e8e8e4] bg-white px-6 py-3">
              {run ? (
                <button type="button" onClick={() => setEditing(false)} className="text-[12px] font-semibold text-[#555] hover:underline">
                  Volver a la estrategia
                </button>
              ) : <span />}
              <button
                type="submit"
                disabled={running}
                className="flex items-center gap-2 rounded-full bg-[#FF7F00] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#e67200] disabled:opacity-60"
              >
                {running && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {running ? 'Armando estrategia…' : 'Armar estrategia'}
              </button>
            </div>
          </form>
        ) : (
          <StrategyResult
            run={run}
            clientId={clientId}
            clientName={clientName}
            onRunChange={onRunChange}
            onNewRun={() => {
              setInput(run.input)
              setEditing(true)
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
