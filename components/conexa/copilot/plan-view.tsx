'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { REJECT_REASONS, resolveWhy, type Play, type Recommendation } from '@/lib/conexa/copilot/types'
import { ActionDetail } from './action-detail'
import type { CopilotState } from './use-copilot'
import { EmptyState, PlatformIcon, PriorityBadge, VersionBadge, WhyBox, WhyToggle, platformLabel } from './shared'

const PAGE_SIZE = 50

type Props = {
  items: Recommendation[]
  all: Recommendation[]
  playOf: (rec: Recommendation) => Play | undefined
  copilot: CopilotState
  onGoHistory: () => void
  onGoScheduled: () => void
}

export function PlanView({ items, all, playOf, copilot, onGoHistory, onGoScheduled }: Props) {
  const [openWhy, setOpenWhy] = useState<string | null>(null)
  const [discardId, setDiscardId] = useState<string | null>(null)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const drawerRec = all.find((item) => item.id === drawerId)

  if (!items.length) return <EmptyState>No hay acciones pendientes para este filtro.</EmptyState>

  return (
    <>
      <ul className="mx-auto flex max-w-[760px] flex-col gap-3">
        {items.slice(0, limit).map((rec) => (
          <li key={rec.id} className="flex flex-col gap-3 rounded-xl border border-[#e8e8e5] bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformIcon platform={rec.platform} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{rec.type} · {platformLabel(rec.platform)}</span>
              <PriorityBadge priority={rec.priority} />
              <VersionBadge rec={rec} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-balance text-[16px] font-bold leading-snug text-[#202020]">{rec.title}</h3>
              <p className="text-pretty text-[13px] leading-relaxed text-[#737373]">{resolveWhy(rec)}</p>
              <div><WhyToggle count={rec.sources.length} open={openWhy === rec.id} onToggle={() => setOpenWhy((current) => (current === rec.id ? null : rec.id))} controls={`plan-why-${rec.id}`} /></div>
              {openWhy === rec.id && <div id={`plan-why-${rec.id}`}><WhyBox rec={rec} play={playOf(rec)} showSummary /></div>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f5f5f4] px-3 py-2.5 text-[13px]">
              <span className="flex items-center gap-2 text-[#404040]">
                <span>{rec.before}</span><ArrowRight className="size-3.5 text-[#a3a3a3]" aria-hidden /><span className="font-semibold text-[#202020]">{rec.after}</span>
              </span>
              <span className="text-[12.5px] font-medium text-[#15803d]">{rec.impact}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setDrawerId(rec.id)}>Revisar y aprobar</Button>
              <Button size="sm" variant="outline" aria-expanded={discardId === rec.id} onClick={() => setDiscardId((current) => (current === rec.id ? null : rec.id))}>Descartar</Button>
            </div>
            {discardId === rec.id && (
              <div className="flex flex-col gap-2 rounded-lg border border-[#e8e8e5] p-3">
                <div className="flex flex-wrap gap-1.5">
                  {REJECT_REASONS.map((reason) => (
                    <button key={reason} type="button" onClick={() => { setDiscardId(null); void copilot.reject(rec, reason) }} className="rounded-full border border-[#dededb] px-2.5 py-1 text-[12px] text-[#404040] hover:border-[#202020]">{reason}</button>
                  ))}
                </div>
                <p className="text-[11.5px] text-[#5b5fe8]"><span aria-hidden>{'✦ '}</span>Conexa lo usa en las próximas sugerencias.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      {items.length > limit && <div className="mt-3 text-center"><button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="text-[12.5px] font-medium text-[#404040] underline underline-offset-2">Ver más acciones</button></div>}

      <Sheet open={Boolean(drawerRec)} onOpenChange={(open) => { if (!open) setDrawerId(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
          <SheetHeader className="sr-only"><SheetTitle>{drawerRec?.title ?? 'Detalle'}</SheetTitle></SheetHeader>
          <div className="px-5 pb-6 pt-10">
            {drawerRec && <ActionDetail key={`${drawerRec.id}-${drawerRec.version}`} rec={drawerRec} play={playOf(drawerRec)} copilot={copilot} onGoHistory={() => { setDrawerId(null); onGoHistory() }} onGoScheduled={() => { setDrawerId(null); onGoScheduled() }} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
