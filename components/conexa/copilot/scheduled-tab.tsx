'use client'

import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Recommendation } from '@/lib/conexa/copilot/types'
import type { CopilotState } from './use-copilot'
import { EmptyState, PlatformIcon } from './shared'

export function ScheduledTab({ items, copilot }: { items: Recommendation[]; copilot: CopilotState }) {
  if (!items.length) return <EmptyState>No hay acciones programadas. Al aprobar una acción podés elegir cuándo se ejecuta.</EmptyState>
  return (
    <ul className="flex flex-col divide-y divide-[#ececea] rounded-xl border border-[#e8e8e5] bg-white">
      {items.map((rec) => (
        <li key={rec.id} className="flex flex-wrap items-center gap-3 p-3">
          <PlatformIcon platform={rec.platform} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-semibold text-[#202020]">{rec.title}</span>
            <span className="flex items-center gap-1 text-[12px] text-[#737373]"><Clock className="size-3" aria-hidden />{rec.slot}</span>
          </div>
          <Button size="sm" onClick={() => copilot.runNow(rec)}>Ejecutar ahora</Button>
          <Button size="sm" variant="outline" onClick={() => copilot.cancel(rec)}>Cancelar</Button>
        </li>
      ))}
    </ul>
  )
}
