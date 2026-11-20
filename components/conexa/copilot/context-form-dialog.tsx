'use client'

import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PROFILE_FIELDS, type ProfileFieldKey } from '@/lib/conexa/copilot/profile-fields'
import type { ContextAssessment, ProfileUpdate } from '@/lib/conexa/copilot/client-profile'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  assessment: ContextAssessment | null
  onSaveProfile: (updates: ProfileUpdate[]) => Promise<unknown>
  onAddNote: (content: string) => Promise<unknown>
}

/** "+ Contexto": completa o corrige los campos del Contexto del cliente y, si hace falta, suma una nota libre. */
export function ContextFormDialog({ open, onOpenChange, assessment, onSaveProfile, onAddNote }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && <ContextForm assessment={assessment} onCancel={() => onOpenChange(false)} onDone={() => onOpenChange(false)} onSaveProfile={onSaveProfile} onAddNote={onAddNote} />}
      </DialogContent>
    </Dialog>
  )
}

const asText = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value))

function ContextForm({ assessment, onCancel, onDone, onSaveProfile, onAddNote }: { assessment: ContextAssessment | null; onCancel: () => void; onDone: () => void; onSaveProfile: Props['onSaveProfile']; onAddNote: Props['onAddNote'] }) {
  const initial = Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, asText(assessment?.fields.find((item) => item.key === field.key)?.value)])) as Record<ProfileFieldKey, string>
  const [values, setValues] = useState(initial)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const updates: ProfileUpdate[] = PROFILE_FIELDS
    .filter((field) => values[field.key].trim() && values[field.key].trim() !== initial[field.key].trim())
    .map((field) => ({ field: field.key, value: values[field.key].trim().slice(0, 600) }))
  const hasNote = note.trim().length >= 3
  const canSave = !saving && (updates.length > 0 || hasNote)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      if (updates.length) await onSaveProfile(updates)
      if (hasNote) await onAddNote(note.trim())
      toast.success(updates.length ? 'Guardado en Contexto del cliente' : 'Contexto guardado para este cliente')
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el contexto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Completar contexto del cliente</DialogTitle>
        <DialogDescription className="text-pretty leading-relaxed">Se guarda en el formulario Contexto del cliente y Conexa lo usa en el Tablero, Chat / Análisis y Recomendaciones.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        {PROFILE_FIELDS.map((field) => {
          const id = `context-field-${field.key}`
          const missing = !initial[field.key]
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={id} className="flex items-center gap-1.5 text-xs">
                {field.label}
                {field.core && <span className="text-primary" aria-hidden="true">*</span>}
                {field.core && <span className="sr-only">(obligatorio)</span>}
                {missing && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">Falta</span>}
              </Label>
              {field.key === 'additional_context' ? (
                <Textarea id={id} value={values[field.key]} maxLength={600} rows={3} placeholder={field.question} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} disabled={saving} className="text-xs" />
              ) : (
                <Input id={id} value={values[field.key]} maxLength={600} inputMode={field.kind === 'number' ? 'decimal' : undefined} placeholder={field.question} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} disabled={saving} className="h-9 text-xs" />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Label htmlFor="context-extra-note" className="text-xs">Otra nota para tener en cuenta <span className="font-normal text-muted-foreground">(opcional)</span></Label>
        <Textarea id="context-extra-note" value={note} maxLength={2000} rows={2} onChange={(event) => setNote(event.target.value)} placeholder="Promociones, estacionalidad, restricciones, feedback del cliente…" disabled={saving} className="text-xs" />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={!canSave}>
          {saving && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
          {saving ? 'Guardando…' : 'Guardar contexto'}
        </Button>
      </DialogFooter>
    </form>
  )
}
