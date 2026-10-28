'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { resolveWhy, type Play, type Priority, type Recommendation } from '@/lib/conexa/copilot/types'
import { ActionDetail } from './action-detail'
import type { CopilotState } from './use-copilot'
import { EmptyState, PlatformIcon, PRIORITY_DOT, VersionBadge, WhyBox, WhyToggle } from './shared'

const PRIORITIES: Priority[] = ['alta', 'media', 'baja']
const PAGE_SIZE = 50

type Props = {
  items: Recommendation[]
  selected?: Recommendation
  onSelect: (id: string) => void
  playOf: (rec: Recommendation) => Play | undefined
  copilot: CopilotState
  onGoHistory: () => void
  onGoScheduled: () => void
}

export function InboxView({ items, selected, onSelect, playOf, copilot, onGoHistory, onGoScheduled }: Props) {
  const [openWhy, setOpenWhy] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE_SIZE)
  const visible = items.slice(0, limit)

  const toggleWhy = (id: string) => setOpenWhy((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col gap-5">
        {items.length === 0 && <EmptyState>No hay acciones pendientes para este filtro.</EmptyState>}
        {PRIORITIES.map((priority) => {
          const group = visible.filter((item) => item.priority === priority)
          if (!group.length) return null
          return (
            <section key={priority} aria-label={`Prioridad ${priority}`} className="flex flex-col gap-1.5">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                <span className={cn('size-2 rounded-full', PRIORITY_DOT[priority])} aria-hidden />{priority}
                <span className="font-normal text-[#a3a3a3]">{group.length}</span>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {group.map((rec) => {
                  const isOpen = openWhy.has(rec.id)
                  const isSelected = selected?.id === rec.id
                  const whyId = `why-${rec.id}`
                  return (
                    <li key={rec.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        onClick={() => onSelect(rec.id)}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(rec.id) } }}
                        className={cn('flex cursor-pointer gap-3 rounded-xl border bg-white p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#5b5fe8]', isSelected ? 'border-[#202020]' : 'border-[#e8e8e5] hover:border-[#c8c8c4]')}
                      >
                        <PlatformIcon platform={rec.platform} />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#8a8a8a]">{rec.type}</span>
                            <VersionBadge rec={rec} />
                          </div>
                          <p className="text-[13.5px] font-semibold leading-snug text-[#202020]">{rec.title}</p>
                          <p className="line-clamp-2 text-pretty text-[12.5px] leading-relaxed text-[#737373]">{resolveWhy(rec)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-[12px] font-medium text-[#15803d]">{rec.impact}</span>
                            <WhyToggle count={rec.sources.length} open={isOpen} onToggle={() => toggleWhy(rec.id)} controls={whyId} />
                          </div>
                          {isOpen && <div id={whyId} onClick={(event) => event.stopPropagation()}><WhyBox rec={rec} play={playOf(rec)} /></div>}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
        {items.length > limit && <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className="self-center text-[12.5px] font-medium text-[#404040] underline underline-offset-2">Ver {Math.min(PAGE_SIZE, items.length - limit)} acciones más</button>}
      </div>

      <aside className="rounded-xl border border-[#e8e8e5] bg-white p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto" aria-label="Detalle de la acción">
        {selected ? <ActionDetail key={`${selected.id}-${selected.version}`} rec={selected} play={playOf(selected)} copilot={copilot} onGoHistory={onGoHistory} onGoScheduled={onGoScheduled} /> : <p className="py-10 text-center text-[13px] text-[#737373]">Elegí una acción para ver el detalle.</p>}
      </aside>
    </div>
  )
}
