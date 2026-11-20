'use client'

import { useState, type FormEvent } from 'react'
import { AlertCircle, ExternalLink, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ConnectorDefinition } from '@/lib/connectors/catalog'

export function CredentialsDialog({ connector, onClose, onSaved }: { connector: ConnectorDefinition | null; onClose: () => void; onSaved: (connector: ConnectorDefinition, label: string, verified: boolean) => void }) {
  return (
    <Dialog open={Boolean(connector)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        {connector && <CredentialsForm key={connector.id} connector={connector} onCancel={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function CredentialsForm({ connector, onCancel, onSaved }: { connector: ConnectorDefinition; onCancel: () => void; onSaved: (connector: ConnectorDefinition, label: string, verified: boolean) => void }) {
  const fields = connector.fields ?? []
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ''])))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const response = await fetch(`/api/connectors/${connector.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }).catch(() => null)
    const payload = await response?.json().catch(() => ({})) ?? {}
    setSaving(false)
    if (!response?.ok) {
      setError(payload.error ?? 'No se pudo guardar la conexión.')
      return
    }
    onSaved(connector, payload.label ?? connector.name, Boolean(payload.verified))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{`Conectar ${connector.name}`}</DialogTitle>
        <DialogDescription className="text-pretty leading-relaxed">
          {connector.verifies
            ? 'Vamos a probar estos datos contra la API antes de guardarlos.'
            : 'Guardamos estos datos para usarlos en los pedidos a la API. Esta app no tiene una prueba automática, así que revisalos bien.'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {fields.map((field) => {
          const inputId = `${connector.id}-${field.name}`
          const helpId = field.help ? `${inputId}-help` : undefined
          return (
            <div key={field.name} className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>
                {field.label}
                {field.optional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
              </Label>
              <Input
                id={inputId}
                name={field.name}
                type={field.type}
                value={values[field.name] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                placeholder={field.placeholder}
                required={!field.optional}
                autoComplete={field.type === 'password' ? 'new-password' : field.type === 'email' ? 'email' : 'off'}
                spellCheck={false}
                aria-describedby={helpId}
                disabled={saving}
              />
              {field.help && <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">{field.help}</p>}
            </div>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-relaxed text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden="true" />Se guarda cifrado y solo para tu usuario.</span>
        {connector.helpUrl && (
          <a href={connector.helpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Cómo obtenerlo
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {saving ? (connector.verifies ? 'Probando…' : 'Guardando…') : connector.verifies ? 'Probar y conectar' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
