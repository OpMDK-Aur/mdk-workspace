'use client'

import { Activity, Megaphone, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLATFORM_LABEL, type CopilotPlatform, type Play, type Priority, type Recommendation, type ResultState } from '@/lib/conexa/copilot/types'

const PLATFORM_ICON = { meta: Megaphone, 'google-ads': Search, crm: Users, tracking: Activity } satisfies Record<CopilotPlatform, unknown>

export function PlatformIcon({ platform, size = 28 }: { platform: CopilotPlatform; size?: number }) {
  const Icon = PLATFORM_ICON[platform]
  return (
    <span className="flex shrink-0 items-center justify-center rounded-md border border-[#e8e8e5] bg-white text-[#5c5c5c]" style={{ width: size, height: size }} aria-hidden>
      <Icon className="size-3.5" />
    </span>
  )
}

export const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }
export const PRIORITY_DOT: Record<Priority, string> = { alta: 'bg-[#dc2626]', media: 'bg-[#d97706]', baja: 'bg-[#a3a3a3]' }

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
      priority === 'alta' ? 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]' : priority === 'media' ? 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]' : 'border-[#e5e5e5] bg-[#fafafa] text-[#737373]')}>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

export function VersionBadge({ rec }: { rec: Recommendation }) {
  if (rec.version < 2) return null
  return <span className="rounded border border-[#d9daff] bg-[#eeefff] px-1.5 py-px font-mono text-[10px] font-semibold text-[#5b5fe8]" title={rec.edited ? 'Editada' : 'Reformulada por Conexa'}>v{rec.version}</span>
}

export const platformLabel = (platform: CopilotPlatform) => PLATFORM_LABEL[platform]

/** Motivos y jugada, sin pedir datos extra: todo viene en la recomendación. */
export function WhyBox({ rec, play, showSummary = false }: { rec: Recommendation; play?: Play; showSummary?: boolean }) {
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg bg-[#f5f5f4] p-3 text-[12.5px] leading-relaxed text-[#404040]">
      {showSummary && <p className="text-pretty">{rec.summary}</p>}
      <ul className="flex flex-col gap-1.5">
        {rec.sources.map((source, index) => (
          <li key={index} className="flex flex-wrap items-baseline gap-1.5">
            <SourceChip kind={source.k} />
            <span className="text-pretty">{source.t}</span>
            <span className="text-[#8a8a8a]">{'· '}{source.f}</span>
          </li>
        ))}
      </ul>
      {play && <PlayNote play={play} />}
    </div>
  )
}

export function PlayNote({ play }: { play: Play }) {
  return (
    <p className="text-pretty text-[12.5px] leading-relaxed text-[#5b5fe8]">
      <span aria-hidden>{'✦ '}</span>Parte de la jugada <strong className="font-semibold">{play.kind}</strong>: {play.move}
    </p>
  )
}

export function SourceChip({ kind }: { kind: string }) {
  return <span className="shrink-0 rounded border border-[#e5e5e5] bg-white px-1.5 py-px text-[10.5px] font-semibold text-[#525252]">{kind}</span>
}

export function WhyToggle({ count, open, onToggle, controls }: { count: number; open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      onKeyDown={(event) => event.stopPropagation()}
      className="text-[12px] font-medium text-[#5b5fe8] underline-offset-2 hover:underline"
    >
      {open ? 'Ocultar motivos' : `Ver por qué (${count})`}
    </button>
  )
}

const RESULT_LABEL: Record<ResultState, string> = { measuring: 'Midiendo', ok: 'Funcionó', bad: 'No funcionó', scheduled: 'Programada', none: '—' }
const RESULT_STYLE: Record<ResultState, string> = {
  measuring: 'bg-[#f5f5f4] text-[#525252]',
  ok: 'bg-[#ecfdf3] text-[#15803d]',
  bad: 'bg-[#fef2f2] text-[#b91c1c]',
  scheduled: 'bg-[#eeefff] text-[#5b5fe8]',
  none: 'text-[#a3a3a3]',
}

export function ResultBadge({ result }: { result: { state: ResultState; metric?: string; day?: number } }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide', RESULT_STYLE[result.state])}>
        {RESULT_LABEL[result.state]}{result.state === 'measuring' && result.day ? ` · día ${result.day} de 7` : ''}
      </span>
      {result.metric && <span className="text-[11.5px] text-[#737373]">{result.metric}</span>}
    </span>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#dededb] px-6 py-10 text-center text-[13px] text-[#737373]">{children}</div>
}
