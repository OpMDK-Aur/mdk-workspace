'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  creativeTaskTitle,
  personaTaskMeta,
  personaTaskTitle,
  type DesignAssignee,
  type Persona,
  type SendToDesignBody,
  type StrategyRun,
} from '@/lib/conexa/agents/creative-strategy-types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  run: StrategyRun
  clientId: string
  clientName: string
  creativeIds: string[]
  onSent: (personas: Persona[]) => void
}

const PRIORITIES: { value: SendToDesignBody['priority']; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
]

const fetchAssignees = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No pudimos leer el equipo')
  return ((await res.json()) as { assignees: DesignAssignee[] }).assignees
}

export function SendToDesignDialog({ open, onOpenChange, run, clientId, clientName, creativeIds, onSent }: Props) {
  const { data: assignees, error: assigneesError } = useSWR(open ? '/api/conexa/agents/creative-strategy/assignees' : null, fetchAssignees)
  const [groupBy, setGroupBy] = useState<SendToDesignBody['groupBy']>('creative')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<SendToDesignBody['priority']>('media')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!assigneeId && assignees?.length) setAssigneeId(assignees[0].id)
  }, [assignees, assigneeId])

  const preview = useMemo(() => {
    const selected = new Set(creativeIds)
    return run.personas.flatMap((persona) => {
      const creatives = persona.creatives.filter((creative) => selected.has(creative.id))
      if (!creatives.length) return []
      if (groupBy === 'persona') return [{ key: persona.id, title: personaTaskTitle(persona, clientName), meta: personaTaskMeta(creatives) }]
      return creatives.map((creative) => ({ key: creative.id, title: creativeTaskTitle(creative, persona), meta: creative.angle }))
    })
  }, [run, creativeIds, groupBy, clientName])

  const designPeople = assignees?.filter((person) => person.isDesign) ?? []
  const otherPeople = assignees?.filter((person) => !person.isDesign) ?? []

  async function handleSend() {
    if (!assigneeId) {
      setError('Elegí un responsable.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/conexa/agents/creative-strategy/${run.id}/send-to-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientName,
          creativeIds,
          groupBy,
          assigneeId,
          dueDate: dueDate || null,
          priority,
          personas: run.persisted === false ? run.personas : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No pudimos crear las tareas')
      onSent(data.personas as Persona[])
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos crear las tareas')
    } finally {
      setSending(false)
    }
  }

  const labelClass = 'text-[11.5px] font-medium text-[#555]'
  const fieldClass = 'w-full rounded-lg border border-[#dcdcd8] bg-white px-3 py-2 text-[13px] text-[#141414] outline-none focus-visible:border-[#5B5FE8] focus-visible:ring-2 focus-visible:ring-[#5B5FE8]/20'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto border-[#dcdcd8] bg-white text-[#141414] sm:max-w-[520px]">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[15px] font-semibold text-[#141414]">Enviar a diseño</DialogTitle>
          <DialogDescription className="text-[12px] text-[#777]">
            {`Se crean ${preview.length} ${preview.length === 1 ? 'tarea' : 'tareas'} de Diseño gráfico con el brief de cada creativo.`}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2">
          <legend className={cn(labelClass, 'mb-1.5')}>Cómo agrupar</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['creative', 'Una tarea por creativo'],
              ['persona', 'Una tarea por persona'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={groupBy === value}
                onClick={() => setGroupBy(value)}
                className={cn('rounded-lg border px-3 py-2 text-left text-[12px] font-medium transition-colors', groupBy === value ? 'border-[#141414] bg-[#141414] text-white' : 'border-[#dcdcd8] text-[#555] hover:border-[#bbb]')}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>Responsable</span>
            <select className={fieldClass} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={!assignees}>
              {!assignees && <option value="">{assigneesError ? 'No pudimos leer el equipo' : 'Cargando equipo…'}</option>}
              {designPeople.length > 0 && (
                <optgroup label="Diseño">
                  {designPeople.map((person) => <option key={person.id} value={person.id}>{person.recent ? `${person.name} · reciente` : person.name}</option>)}
                </optgroup>
              )}
              {otherPeople.length > 0 && (
                <optgroup label="Resto del equipo">
                  {otherPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Fecha de entrega</span>
            <input type="date" className={fieldClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={cn(labelClass, 'mb-1.5')}>Prioridad</legend>
            <div className="flex gap-1.5">
              {PRIORITIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={priority === item.value}
                  onClick={() => setPriority(item.value)}
                  className={cn('flex-1 rounded-lg border py-2 text-[12px] font-medium transition-colors', priority === item.value ? 'border-[#141414] bg-[#141414] text-white' : 'border-[#dcdcd8] text-[#555] hover:border-[#bbb]')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Tareas que se crean</p>
          <ul className="flex max-h-[180px] flex-col divide-y divide-[#f0f0ed] overflow-y-auto rounded-lg border border-[#e8e8e4]">
            {preview.map((item) => (
              <li key={item.key} className="flex flex-col px-3 py-2">
                <span className="truncate text-[12px] font-medium">{item.title}</span>
                <span className="truncate text-[11px] text-[#999]">{item.meta}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && <p role="alert" className="rounded-lg bg-[#FF7F00]/10 px-3 py-2 text-[12px] text-[#a34f00]">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => onOpenChange(false)} className="text-[12px] font-semibold text-[#555] hover:underline">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !preview.length || !assigneeId}
            className="flex items-center gap-2 rounded-full bg-[#141414] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#333] disabled:opacity-40"
          >
            {sending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {sending ? 'Creando tareas…' : `Crear ${preview.length} ${preview.length === 1 ? 'tarea' : 'tareas'}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
