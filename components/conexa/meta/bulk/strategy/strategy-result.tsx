'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  allCreatives,
  FORMAT_SWATCH,
  taskCode,
  type Creative,
  type Persona,
  type StrategyRun,
} from '@/lib/conexa/agents/creative-strategy-types'
import { SendToDesignDialog } from './send-to-design-dialog'

type Props = {
  run: StrategyRun
  clientId: string
  clientName: string
  onRunChange: (run: StrategyRun) => void
  onNewRun: () => void
}

function StatusBadge({ creative }: { creative: Creative }) {
  if (creative.status === 'por_disenar') {
    return <span className="rounded-full border border-[#dcdcd8] px-2 py-0.5 text-[10.5px] text-[#777]">Por diseñar</span>
  }
  const label = creative.status === 'listo' ? 'Listo' : 'En diseño'
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-[#5B5FE8]/10 px-2 py-0.5 text-[10.5px] font-medium text-[#3d41c4]">
      {label}
      {creative.taskId && <span className="font-mono">{taskCode(creative.taskId)}</span>}
      {creative.assigneeName && <span className="text-[#5B5FE8]/80">{`· ${creative.assigneeName}`}</span>}
    </span>
  )
}

function CreativeRow({ creative, persona, selected, onToggle }: { creative: Creative; persona: Persona; selected: boolean; onToggle: () => void }) {
  const pending = creative.status === 'por_disenar'
  const pain = persona.pains.find((item) => item.id === creative.painId)
  return (
    <li className={cn('flex gap-3 rounded-lg border bg-white p-3 transition-colors', selected ? 'border-[#141414]' : 'border-[#e8e8e4]')}>
      <input
        type="checkbox"
        className="mt-0.5 size-3.5 shrink-0 accent-[#141414] disabled:opacity-40"
        checked={selected}
        disabled={!pending}
        onChange={onToggle}
        aria-label={`Seleccionar ${creative.id}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[11.5px] font-semibold">{creative.id}</span>
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium">
            <span className={cn('size-2 rounded-full', FORMAT_SWATCH[creative.format])} aria-hidden="true" />
            {creative.format}
          </span>
          <span className="text-[11px] text-[#888]">{creative.angle}</span>
          <span className="font-mono text-[10.5px] text-[#aaa]" title={pain?.text}>{creative.painId}</span>
          <span className="ml-auto"><StatusBadge creative={creative} /></span>
        </div>
        <p className="text-pretty text-[13px] font-semibold leading-snug">{`“${creative.hook}”`}</p>
        <p className="text-pretty text-[12px] leading-relaxed text-[#555]">{creative.message}</p>
        <dl className="grid grid-cols-1 gap-2 border-t border-[#f0f0ed] pt-2 text-[11px] sm:grid-cols-[auto_1fr]">
          <dt className="text-[#999]">CTA</dt>
          <dd className="text-[#333]">{creative.cta}</dd>
          <dt className="text-[#999]">Señal para Andrómeda</dt>
          <dd className="text-pretty text-[#333]">{creative.andromedaSignal}</dd>
        </dl>
      </div>
    </li>
  )
}

export function StrategyResult({ run, clientId, clientName, onRunChange, onNewRun }: Props) {
  const pendingIds = useMemo(() => allCreatives(run).filter((creative) => creative.status === 'por_disenar').map((creative) => creative.id), [run])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pendingIds))
  const [dialogOpen, setDialogOpen] = useState(false)
  const selectedPending = pendingIds.filter((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSent(personas: Persona[]) {
    onRunChange({ ...run, personas })
    setSelected(new Set())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[#e8e8e4] bg-white px-6 py-2.5">
        <button
          type="button"
          onClick={() => setSelected(selectedPending.length === pendingIds.length ? new Set() : new Set(pendingIds))}
          disabled={!pendingIds.length}
          className="text-[11.5px] font-semibold text-[#555] hover:underline disabled:opacity-40"
        >
          {selectedPending.length === pendingIds.length && pendingIds.length ? 'Quitar selección' : 'Seleccionar pendientes'}
        </button>
        <button type="button" onClick={onNewRun} className="text-[11.5px] font-semibold text-[#5B5FE8] hover:underline">
          Nueva ejecución
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {run.persisted === false && (
          <p className="rounded-lg bg-[#FF7F00]/10 px-3 py-2 text-[11.5px] leading-relaxed text-[#a34f00]">
            Esta estrategia no quedó guardada todavía: falta crear la tabla de estrategias. Podés usarla y mandarla a diseño en esta sesión.
          </p>
        )}

        {run.personas.map((persona) => (
          <section key={persona.id} className="flex flex-col gap-3" aria-labelledby={`persona-${persona.id}`}>
            <header className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-[#999]">{persona.id}</span>
                <h3 id={`persona-${persona.id}`} className="text-balance text-[14px] font-semibold">{persona.name}</h3>
              </div>
              <p className="text-pretty text-[12px] leading-relaxed text-[#555]">{persona.profile}</p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-[auto_1fr]">
                <dt className="text-[#999]">Lo que desea</dt>
                <dd className="text-pretty text-[#333]">{persona.wants}</dd>
                <dt className="text-[#999]">Dolores</dt>
                <dd>
                  <ul className="flex flex-col gap-1">
                    {persona.pains.map((pain) => (
                      <li key={pain.id} className="flex gap-2 text-pretty text-[#333]">
                        <span className="font-mono text-[10.5px] text-[#aaa]">{pain.id}</span>
                        {pain.text}
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>
            </header>
            <ul className="flex flex-col gap-2">
              {persona.creatives.map((creative) => (
                <CreativeRow key={creative.id} creative={creative} persona={persona} selected={selected.has(creative.id)} onToggle={() => toggle(creative.id)} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#e8e8e4] bg-white px-6 py-3">
        <p className="text-[12px] text-[#777]">
          {selectedPending.length ? `${selectedPending.length} ${selectedPending.length === 1 ? 'creativo seleccionado' : 'creativos seleccionados'}` : 'Elegí creativos para mandar a diseño'}
        </p>
        <button
          type="button"
          disabled={!selectedPending.length}
          onClick={() => setDialogOpen(true)}
          className="rounded-full bg-[#141414] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#333] disabled:opacity-40"
        >
          Enviar a diseño
        </button>
      </div>

      <SendToDesignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        run={run}
        clientId={clientId}
        clientName={clientName}
        creativeIds={selectedPending}
        onSent={handleSent}
      />
    </div>
  )
}
