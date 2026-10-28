'use client'

import { useId, useState } from 'react'
import { ArrowRight, Check, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { REJECT_REASONS, type Play, type Recommendation } from '@/lib/conexa/copilot/types'
import type { CopilotState } from './use-copilot'
import { PlatformIcon, PlayNote, PriorityBadge, SourceChip, VersionBadge, platformLabel } from './shared'

const QUICK_INSTRUCTIONS = ['Más conservadora', 'Más agresiva', 'Solo por 7 días']
const SLOT_OPTIONS = ['Hoy 23:59', 'Mañana 08:00']

const isComposing = (event: React.KeyboardEvent) => event.nativeEvent.isComposing || event.keyCode === 229

function formatCustomSlot(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

type Props = { rec: Recommendation; play?: Play; copilot: CopilotState; onGoHistory: () => void; onGoScheduled: () => void }

export function ActionDetail({ rec, play, copilot, onGoHistory, onGoScheduled }: Props) {
  const confirmId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(rec.after)
  const [instruction, setInstruction] = useState('')
  const [reformulating, setReformulating] = useState(false)
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [slotChoice, setSlotChoice] = useState(SLOT_OPTIONS[0])
  const [customDate, setCustomDate] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  const slot = slotChoice === 'custom' ? formatCustomSlot(customDate) : slotChoice
  const pending = rec.status === 'pending'

  async function saveEdit() {
    const value = draft.trim()
    if (!value || value === rec.after) { setEditing(false); return }
    setEditing(false)
    await copilot.edit(rec, value)
  }

  async function reformulate(text: string) {
    const value = text.trim()
    if (!value || reformulating) return
    setReformulating(true)
    const ok = await copilot.reformulate(rec, value)
    setReformulating(false)
    if (ok) { setInstruction(''); setConfirmed(false) }
  }

  return (
    <article className="flex flex-col gap-5" aria-label={rec.title}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[#737373]">
          <PlatformIcon platform={rec.platform} size={22} />
          <span>{platformLabel(rec.platform)}</span>
          <span aria-hidden>·</span>
          <span className="font-semibold uppercase tracking-wide">{rec.type}</span>
          <PriorityBadge priority={rec.priority} />
          <VersionBadge rec={rec} />
        </div>
        <h2 className="text-balance text-[19px] font-bold leading-snug text-[#202020]">{rec.title}</h2>
        <p className="text-[12.5px] text-[#737373]">{rec.entity}</p>
        <p className="text-pretty text-[13px] leading-relaxed text-[#404040]">{rec.summary}</p>
        {rec.revisionNote && <p className="rounded-md bg-[#eeefff] px-3 py-2 text-[12.5px] leading-relaxed text-[#5b5fe8]"><span aria-hidden>{'✦ '}</span>{rec.revisionNote}</p>}
      </header>

      <section className="flex flex-col gap-2" aria-label="Cambio propuesto">
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
          <div className="rounded-lg border border-[#e8e8e5] p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#8a8a8a]">Valor actual</p>
            <p className="mt-1 text-[14px] font-semibold text-[#404040]">{rec.before}</p>
          </div>
          <ArrowRight className="size-4 self-center text-[#a3a3a3]" aria-hidden />
          <div className="rounded-lg border border-[#202020] p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#8a8a8a]">Propuesto</p>
            {editing ? (
              <Input
                autoFocus
                value={draft}
                maxLength={200}
                aria-label="Valor propuesto"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={saveEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isComposing(event)) { event.preventDefault(); void saveEdit() }
                  if (event.key === 'Escape') { setDraft(rec.after); setEditing(false) }
                }}
                className="mt-1 h-8 text-[14px] font-semibold"
              />
            ) : <p className="mt-1 text-[14px] font-semibold text-[#202020]">{rec.after}</p>}
          </div>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#737373]">Diferencia: <span className="font-medium text-[#404040]">{rec.diff}</span></span>
          {pending && !editing && <button type="button" onClick={() => { setDraft(rec.after); setEditing(true) }} className="font-medium text-[#202020] underline underline-offset-2">Editar valor propuesto</button>}
        </div>
      </section>

      <section className="rounded-lg bg-[#f0fdf4] px-3 py-2.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#15803d]">Impacto estimado</p>
        <p className="mt-0.5 text-[13.5px] font-semibold text-[#166534]">{rec.impact}</p>
        <p className="mt-0.5 text-[11.5px] text-[#4d7c5c]">Hipótesis. Conexa lo mide a 7 días.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#525252]">Por qué lo sugiere</h3>
        {play && <PlayNote play={play} />}
        <ul className="flex flex-col gap-2">
          {rec.sources.map((source, index) => (
            <li key={index} className="flex items-baseline gap-2 text-[12.5px] leading-relaxed text-[#404040]">
              <SourceChip kind={source.k} />
              <span className="text-pretty">{source.t} <span className="text-[#8a8a8a]">{'· '}{source.f}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {pending && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#525252]">Pedile a Conexa que la reformule</h3>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_INSTRUCTIONS.map((item) => (
              <button key={item} type="button" disabled={reformulating} onClick={() => reformulate(item)} className="rounded-full border border-[#d9daff] bg-white px-2.5 py-1 text-[12px] text-[#5b5fe8] hover:bg-[#eeefff] disabled:opacity-50">{item}</button>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void reformulate(instruction) }} className="flex gap-2">
            <Input value={instruction} maxLength={500} disabled={reformulating} onChange={(event) => setInstruction(event.target.value)} placeholder="Ej. que no toque el presupuesto del fin de semana" aria-label="Instrucción para reformular" className="h-9 text-[13px]" />
            <Button type="submit" variant="outline" size="sm" disabled={reformulating || !instruction.trim()} className="h-9">Reformular</Button>
          </form>
          {reformulating && <p className="flex items-center gap-1.5 text-[12.5px] text-[#5b5fe8]" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden />{'✦ Conexa está reformulando…'}</p>}
        </section>
      )}

      {pending ? (
        <section className="flex flex-col gap-3 border-t border-[#ececea] pt-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#525252]">Ejecución</h3>
          <div role="radiogroup" aria-label="Cuándo ejecutar" className="grid grid-cols-2 gap-1 rounded-lg bg-[#f5f5f4] p-1">
            {(['now', 'schedule'] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)} className={cn('rounded-md py-1.5 text-[12.5px] font-medium', mode === value ? 'bg-white text-[#202020] shadow-sm' : 'text-[#737373]')}>
                {value === 'now' ? 'Ejecutar ahora' : 'Programar'}
              </button>
            ))}
          </div>
          {mode === 'schedule' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {SLOT_OPTIONS.map((item) => (
                <button key={item} type="button" aria-pressed={slotChoice === item} onClick={() => setSlotChoice(item)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', slotChoice === item ? 'border-[#202020] bg-[#202020] text-white' : 'border-[#dededb] text-[#404040]')}>{item}</button>
              ))}
              <label className="flex items-center gap-1.5 text-[12px] text-[#525252]">
                <span className="sr-only">Elegir fecha</span>
                <input type="datetime-local" value={customDate} onChange={(event) => { setCustomDate(event.target.value); setSlotChoice('custom') }} className={cn('rounded-full border px-2.5 py-1 text-[12px]', slotChoice === 'custom' ? 'border-[#202020]' : 'border-[#dededb]')} />
              </label>
            </div>
          )}
          <p className="text-pretty text-[12px] leading-relaxed text-[#737373]">{rec.how}. Se guarda el valor anterior para poder revertir.</p>
          <label htmlFor={confirmId} className="flex items-start gap-2 text-[12.5px] text-[#404040]">
            <Checkbox id={confirmId} checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5" />
            Entiendo que este cambio se aplica en la plataforma real.
          </label>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!confirmed || (mode === 'schedule' && !slot)} onClick={() => copilot.approve(rec, mode, mode === 'schedule' ? slot : undefined)}>
              {mode === 'now' ? 'Aprobar y ejecutar' : 'Aprobar y programar'}
            </Button>
            <Button variant="outline" aria-expanded={discarding} onClick={() => setDiscarding((value) => !value)}>Descartar</Button>
          </div>
          {discarding && (
            <div className="flex flex-col gap-2 rounded-lg border border-[#e8e8e5] p-3">
              <p className="text-[12.5px] font-medium text-[#202020]">¿Por qué la descartás?</p>
              <div className="flex flex-wrap gap-1.5">
                {REJECT_REASONS.map((reason) => (
                  <button key={reason} type="button" onClick={() => copilot.reject(rec, reason)} className="rounded-full border border-[#dededb] px-2.5 py-1 text-[12px] text-[#404040] hover:border-[#202020]">{reason}</button>
                ))}
              </div>
              <p className="text-[11.5px] text-[#5b5fe8]"><span aria-hidden>{'✦ '}</span>Conexa lo usa en las próximas sugerencias.</p>
            </div>
          )}
        </section>
      ) : (
        <StatusBlock rec={rec} onGoHistory={onGoHistory} onGoScheduled={onGoScheduled} />
      )}
    </article>
  )
}

function StatusBlock({ rec, onGoHistory, onGoScheduled }: { rec: Recommendation; onGoHistory: () => void; onGoScheduled: () => void }) {
  const base = 'flex items-start gap-2 rounded-lg px-3 py-3 text-[13px] leading-relaxed'
  if (rec.status === 'executing') return <p role="status" className={cn(base, 'bg-[#f5f5f4] text-[#404040]')}><Loader2 className="mt-0.5 size-4 animate-spin" aria-hidden />Aplicando en {platformLabel(rec.platform)}…</p>
  if (rec.status === 'executed') return (
    <div role="status" className={cn(base, 'flex-col bg-[#f0fdf4] text-[#166534]')}>
      <span className="flex items-center gap-1.5 font-medium"><Check className="size-4" aria-hidden />Aplicada · Conexa mide el resultado a 7 días</span>
      <button type="button" onClick={onGoHistory} className="text-[12.5px] underline underline-offset-2">Ver en Historial</button>
    </div>
  )
  if (rec.status === 'scheduled') return (
    <div role="status" className={cn(base, 'flex-col bg-[#eeefff] text-[#3f43c9]')}>
      <span className="flex items-center gap-1.5 font-medium"><Clock className="size-4" aria-hidden />Programada · {rec.slot}</span>
      <span className="text-[12.5px]">Podés ejecutarla antes o cancelarla desde <button type="button" onClick={onGoScheduled} className="underline underline-offset-2">Programadas</button>.</span>
    </div>
  )
  return <p role="status" className={cn(base, 'bg-[#f5f5f4] text-[#525252]')}>Descartada · {rec.rejectReason}</p>
}
