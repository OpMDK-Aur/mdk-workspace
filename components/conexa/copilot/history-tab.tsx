'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DecisionKind } from '@/lib/conexa/copilot/types'
import type { CopilotState } from './use-copilot'
import { EmptyState, ResultBadge, platformLabel } from './shared'

const DECISION_STYLE: Record<DecisionKind, string> = {
  Aprobada: 'text-[#166534]',
  'Editada y aprobada': 'text-[#166534]',
  Rechazada: 'text-[#b91c1c]',
  Revertida: 'text-[#737373]',
}

export function HistoryTab({ copilot }: { copilot: CopilotState }) {
  const { decisions, learnings } = copilot
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-labelledby="copilot-history" className="flex flex-col gap-2">
        <h3 id="copilot-history" className="text-[12px] font-semibold uppercase tracking-wide text-[#525252]">Historial</h3>
        {!decisions.length ? <EmptyState>Todavía no hay decisiones registradas.</EmptyState> : (
          <ul className="flex flex-col divide-y divide-[#ececea] rounded-xl border border-[#e8e8e5] bg-white">
            {decisions.map((decision) => (
              <li key={decision.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11.5px] text-[#8a8a8a]">{decision.date}{decision.platform ? ` · ${platformLabel(decision.platform)}` : ''} · {decision.by}</span>
                  <span className="text-[13.5px] font-semibold text-[#202020]">{decision.title ?? decision.recommended}</span>
                  <span className={cn('text-[12px] font-semibold', DECISION_STYLE[decision.decision])}>{decision.decision}</span>
                  <span className="text-[12px] text-[#737373]">Recomendado: {decision.recommended}{decision.executed && decision.executed !== decision.recommended ? ` · Ejecutado: ${decision.executed}` : ''}</span>
                  {decision.before && decision.after && (
                    <span className="flex items-center gap-1.5 text-[12px] text-[#404040]">{decision.before}<ArrowRight className="size-3 text-[#a3a3a3]" aria-hidden />{decision.after}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-3">
                  <ResultBadge result={decision.result} />
                  {decision.revertible && <Button size="sm" variant="outline" onClick={() => copilot.revert(decision.id)}>Revertir</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="copilot-learnings" className="flex flex-col gap-2">
        <h3 id="copilot-learnings" className="text-[12px] font-semibold uppercase tracking-wide text-[#525252]">Aprendizajes</h3>
        <p className="text-[12px] text-[#737373]">Lo que Conexa tiene en cuenta al proponer.</p>
        <ul className="flex flex-col gap-2">
          {learnings.map((learning) => (
            <li key={learning.id} className="rounded-lg border border-[#e8e8e5] bg-white p-3 text-[12.5px] leading-relaxed text-[#404040]">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-[#8a8a8a]">
                <span aria-hidden className="text-[#5b5fe8]">✦</span>{learning.date}
                {learning.isNew && <span className="rounded bg-[#eeefff] px-1.5 py-px font-semibold text-[#5b5fe8]">Nuevo</span>}
              </div>
              <p className="text-pretty">{learning.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
