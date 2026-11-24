'use client'

import { useState, useTransition } from 'react'
import { ListPlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { addOnboardingObservation, deleteOnboardingObservation, saveOnboardingFollowup } from '@/app/actions/aurelia-followup'
import { emptyFollowup, formatDay, type OnboardingFollowup, type OnboardingObservation, type Survey } from '@/lib/aurelia/followup-shared'
import { todayInArgentina } from '@/lib/aurelia/time-shared'
import { NpsScoreBadge } from './nps-score-badge'

export type FollowupTarget = { id: string; name: string }

type Props = {
  target: FollowupTarget | null
  followup: OnboardingFollowup | undefined
  observations: OnboardingObservation[]
  onClose: () => void
  onChanged: () => Promise<unknown>
  canCreateTask: boolean
  onCreateTask: (prefill?: { titulo?: string; descripcion?: string }) => void
}

export function AureliaOnboardingSheet({ target, followup, observations, onClose, onChanged, canCreateTask, onCreateTask }: Props) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {target && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>{target.name}</SheetTitle>
              <SheetDescription>Seguimiento de onboarding, encuestas NPS y observaciones.</SheetDescription>
              <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5 self-start" disabled={!canCreateTask} onClick={() => onCreateTask()}>
                <ListPlus className="size-3.5" aria-hidden="true" />
                Crear tarea de desarrollo
              </Button>
            </SheetHeader>
            {/* La key reinicia el formulario al cambiar de cliente o al recargar los datos guardados. */}
            <FollowupForm key={`${target.id}-${followup?.updatedAt ?? 'nuevo'}`} target={target} followup={followup ?? emptyFollowup(target.id, target.name)} onChanged={onChanged} />
            <Separator />
            <ObservationsSection target={target} observations={observations} onChanged={onChanged} canCreateTask={canCreateTask} onCreateTask={onCreateTask} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function FollowupForm({ target, followup, onChanged }: { target: FollowupTarget; followup: OnboardingFollowup; onChanged: () => Promise<unknown> }) {
  const [primeraReunion, setPrimeraReunion] = useState(followup.primeraReunion ?? '')
  const [cierre, setCierre] = useState(followup.cierreOnboarding ?? '')
  const [surveys, setSurveys] = useState(() => followup.encuestas.map((survey) => ({ fecha: survey.fecha ?? '', nota: survey.nota === null ? '' : String(survey.nota) })))
  const [saving, startSaving] = useTransition()

  const updateSurvey = (index: number, patch: Partial<(typeof surveys)[number]>) => setSurveys((current) => current.map((survey, position) => (position === index ? { ...survey, ...patch } : survey)))

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    startSaving(async () => {
      const encuestas: Survey[] = surveys.map((survey) => ({ fecha: survey.fecha || null, nota: survey.nota === '' ? null : Number(survey.nota) }))
      const result = await saveOnboardingFollowup({ clientId: target.id, clientName: target.name, primeraReunion: primeraReunion || null, cierreOnboarding: cierre || null, encuestas })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Seguimiento guardado')
      await onChanged()
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="followup-primera-reunion">Fecha de primera reunión</Label>
          <Input id="followup-primera-reunion" type="date" value={primeraReunion} onChange={(event) => setPrimeraReunion(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="followup-cierre">Cierre del onboarding</Label>
          <Input id="followup-cierre" type="date" value={cierre} min={primeraReunion || undefined} onChange={(event) => setCierre(event.target.value)} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Encuestas NPS</legend>
        <div className="grid grid-cols-[auto_1fr_6rem_auto] items-center gap-x-3 gap-y-2">
          <span className="sr-only">Encuesta</span>
          <span className="text-xs text-muted-foreground">Fecha</span>
          <span className="text-xs text-muted-foreground">Nota (0 a 10)</span>
          <span className="sr-only">Categoría</span>
          {surveys.map((survey, index) => (
            <SurveyRow key={index} index={index} fecha={survey.fecha} nota={survey.nota} onChange={(patch) => updateSurvey(index, patch)} />
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{followup.updatedAt ? `Última edición ${formatDay(followup.updatedAt)}` : 'Sin datos cargados todavía.'}</p>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner />}
          Guardar
        </Button>
      </div>
    </form>
  )
}

const ORDINALS = ['Primera', 'Segunda', 'Tercera', 'Cuarta']

function SurveyRow({ index, fecha, nota, onChange }: { index: number; fecha: string; nota: string; onChange: (patch: { fecha?: string; nota?: string }) => void }) {
  const parsed = nota === '' ? null : Number(nota)
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10)
  return (
    <>
      <span className="whitespace-nowrap text-sm">{ORDINALS[index] ?? `Encuesta ${index + 1}`}</span>
      <Input type="date" value={fecha} onChange={(event) => onChange({ fecha: event.target.value })} aria-label={`Fecha de la ${ORDINALS[index]?.toLowerCase()} encuesta`} />
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={10}
        step={1}
        value={nota}
        onChange={(event) => onChange({ nota: event.target.value })}
        aria-label={`Nota de la ${ORDINALS[index]?.toLowerCase()} encuesta`}
        aria-invalid={!valid}
      />
      <NpsScoreBadge nota={valid ? parsed : null} />
    </>
  )
}

function ObservationsSection({ target, observations, onChanged, canCreateTask, onCreateTask }: { target: FollowupTarget; observations: OnboardingObservation[]; onChanged: () => Promise<unknown>; canCreateTask: boolean; onCreateTask: Props['onCreateTask'] }) {
  const [fecha, setFecha] = useState(() => todayInArgentina())
  const [comentario, setComentario] = useState('')
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    if (!comentario.trim()) return
    startTransition(async () => {
      const result = await addOnboardingObservation({ clientId: target.id, clientName: target.name, fecha, comentario })
      if (result.error) {
        toast.error(result.error)
        return
      }
      setComentario('')
      await onChanged()
    })
  }

  const remove = (id: string) => {
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteOnboardingObservation(id)
      setDeletingId(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      await onChanged()
    })
  }

  return (
    <section aria-labelledby="observaciones-title" className="flex flex-col gap-4 p-4">
      <h3 id="observaciones-title" className="text-sm font-medium">Observaciones</h3>
      <form onSubmit={add} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="observacion-fecha" className="text-xs text-muted-foreground">Fecha</Label>
          <Input id="observacion-fecha" type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className="h-8 w-40" required />
        </div>
        <Textarea value={comentario} onChange={(event) => setComentario(event.target.value)} placeholder="Qué pasó, qué pidió el cliente, próximos pasos..." aria-label="Observación" rows={3} maxLength={4000} />
        <Button type="submit" variant="secondary" size="sm" className="self-end" disabled={pending || !comentario.trim()}>Agregar observación</Button>
      </form>

      {observations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay observaciones para este cliente.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {observations.map((observation) => (
            <li key={observation.id} className="flex flex-col gap-1 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{formatDay(observation.fecha)}{observation.autorName && <span className="font-normal text-muted-foreground"> · {observation.autorName}</span>}</span>
                <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={!canCreateTask}
                  onClick={() => onCreateTask({ titulo: observation.comentario.split('\n')[0].slice(0, 120), descripcion: `Observación del ${formatDay(observation.fecha)}:\n${observation.comentario}` })}
                >
                  <ListPlus className="size-3.5" aria-hidden="true" />
                  Crear tarea
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => remove(observation.id)} disabled={deletingId === observation.id} aria-label="Borrar observación">
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-pretty">{observation.comentario}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
