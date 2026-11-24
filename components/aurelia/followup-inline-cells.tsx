'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { saveOnboardingFollowup } from '@/app/actions/aurelia-followup'
import { SURVEY_COUNT, emptyFollowup, formatDay, type OnboardingFollowup } from '@/lib/aurelia/followup-shared'
import { NpsScoreBadge } from './nps-score-badge'

const ORDINALS = ['Primera', 'Segunda', 'Tercera', 'Cuarta']

type Props = {
  client: { id: string; name: string }
  followup: OnboardingFollowup | undefined
  /** Motivo por el que no se puede editar (p. ej. falta la migración); null si se puede. */
  disabledReason: string | null
  onChanged: () => Promise<unknown>
}

function useSave(client: Props['client'], followup: OnboardingFollowup | undefined, onChanged: Props['onChanged']) {
  const [pending, startTransition] = useTransition()
  const save = (patch: (current: OnboardingFollowup) => OnboardingFollowup, onDone: () => void) => {
    startTransition(async () => {
      const next = patch(followup ?? emptyFollowup(client.id, client.name))
      const result = await saveOnboardingFollowup({ clientId: client.id, clientName: client.name, primeraReunion: next.primeraReunion, cierreOnboarding: next.cierreOnboarding, encuestas: next.encuestas })
      if (result.error) {
        toast.error(result.error)
        return
      }
      await onChanged()
      onDone()
    })
  }
  return { pending, save }
}

export function FollowupInlineCells({ client, followup, disabledReason, onChanged }: Props) {
  const encuestas = followup?.encuestas ?? emptyFollowup(client.id).encuestas
  return (
    <>
      <TableCell onClick={(event) => event.stopPropagation()}>
        <DateCell label="Fecha de primera reunión" hint="Por ahora se carga a mano; más adelante se sincroniza con el calendario." value={followup?.primeraReunion ?? null} client={client} followup={followup} disabledReason={disabledReason} onChanged={onChanged} field="primeraReunion" />
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        <DateCell label="Cierre del onboarding" hint="Por ahora se carga a mano; más adelante se sincroniza con el calendario." value={followup?.cierreOnboarding ?? null} client={client} followup={followup} disabledReason={disabledReason} onChanged={onChanged} field="cierreOnboarding" />
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        <div className="flex gap-1">
          {Array.from({ length: SURVEY_COUNT }, (_, index) => (
            <SurveyCell key={index} index={index} survey={encuestas[index]} client={client} followup={followup} disabledReason={disabledReason} onChanged={onChanged} />
          ))}
        </div>
      </TableCell>
    </>
  )
}

function DateCell({ label, hint, value, field, client, followup, disabledReason, onChanged }: Props & { label: string; hint: string; value: string | null; field: 'primeraReunion' | 'cierreOnboarding' }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const { pending, save } = useSave(client, followup, onChanged)
  const apply = (next: string | null) => save((current) => ({ ...current, [field]: next }), () => setOpen(false))

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(value ?? '') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={Boolean(disabledReason)}
          title={disabledReason ?? `Editar ${label.toLowerCase()}`}
          className={cn('group inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60', !value && 'text-muted-foreground')}
        >
          {value ? formatDay(value) : 'Cargar'}
          <Pencil className="size-3 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-64 flex-col gap-3">
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); apply(draft || null) }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${field}-${client.id}`}>{label}</Label>
            <Input id={`${field}-${client.id}`} type="date" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending || !value} onClick={() => apply(null)}>Borrar</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending && <Spinner />}Guardar</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function SurveyCell({ index, survey, client, followup, disabledReason, onChanged }: Props & { index: number; survey: { fecha: string | null; nota: number | null } }) {
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(survey.fecha ?? '')
  const [nota, setNota] = useState(survey.nota === null ? '' : String(survey.nota))
  const { pending, save } = useSave(client, followup, onChanged)
  const name = `${ORDINALS[index]} encuesta`
  const parsed = nota === '' ? null : Number(nota)
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10)

  const apply = (next: { fecha: string | null; nota: number | null }) =>
    save((current) => ({ ...current, encuestas: current.encuestas.map((item, position) => (position === index ? next : item)) }), () => setOpen(false))

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) { setFecha(survey.fecha ?? ''); setNota(survey.nota === null ? '' : String(survey.nota)) } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={Boolean(disabledReason)}
          aria-label={`${name}: ${survey.nota === null ? 'sin cargar' : `nota ${survey.nota}`}. Editar`}
          title={disabledReason ?? `${name}${survey.fecha ? ` · ${formatDay(survey.fecha)}` : ''} · clic para editar`}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 [&:not(:disabled)]:hover:ring-2 [&:not(:disabled)]:hover:ring-ring/40"
        >
          <NpsScoreBadge nota={survey.nota} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (valid) apply({ fecha: fecha || null, nota: parsed }) }}>
          <p className="text-sm font-medium">{name}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`encuesta-${index}-fecha-${client.id}`}>Fecha</Label>
            <Input id={`encuesta-${index}-fecha-${client.id}`} type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`encuesta-${index}-nota-${client.id}`}>Nota (0 a 10)</Label>
            <div className="flex items-center gap-2">
              <Input id={`encuesta-${index}-nota-${client.id}`} type="number" inputMode="numeric" min={0} max={10} step={1} value={nota} onChange={(event) => setNota(event.target.value)} aria-invalid={!valid} autoFocus />
              <NpsScoreBadge nota={valid ? parsed : null} className="shrink-0" />
            </div>
            {!valid && <p className="text-xs text-destructive">Tiene que ser un número entero de 0 a 10.</p>}
          </div>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending || (survey.nota === null && !survey.fecha)} onClick={() => apply({ fecha: null, nota: null })}>Borrar</Button>
            <Button type="submit" size="sm" disabled={pending || !valid}>{pending && <Spinner />}Guardar</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
