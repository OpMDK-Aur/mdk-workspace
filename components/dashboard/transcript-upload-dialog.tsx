'use client'

import { useState, type ChangeEvent, type FormEvent } from 'react'
import { AlertCircle, FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { stripSubtitleTimings } from '@/lib/transcripts/parse'

const MAX_FILE_BYTES = 2 * 1024 * 1024

export function TranscriptUploadDialog({ clientId, open, onOpenChange, onSaved }: { clientId: string; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (message: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <UploadForm clientId={clientId} onCancel={() => onOpenChange(false)} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function UploadForm({ clientId, onCancel, onSaved }: { clientId: string; onCancel: () => void; onSaved: (message: string) => void }) {
  const [mode, setMode] = useState<'doc' | 'manual'>('doc')
  const [doc, setDoc] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setError('El archivo pesa más de 2 MB. Pegá el texto o subí un archivo más chico.')
      return
    }
    const text = await file.text()
    setContent(/\.(vtt|srt)$/i.test(file.name) ? stripSubtitleTimings(text) : text)
    setFileName(file.name)
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
    setError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const body = mode === 'doc'
      ? { mode, doc }
      : { mode, title, content, meetingDate: date ? new Date(date).toISOString() : null }
    const response = await fetch(`/api/clients/${clientId}/transcripts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const payload = await response?.json().catch(() => ({})) ?? {}
    setSaving(false)
    if (!response?.ok) {
      setError(payload.error ?? 'No se pudo guardar la transcripción.')
      return
    }
    onSaved(payload.status === 'duplicate' ? 'Ese documento ya estaba cargado en este cliente.' : 'Transcripción cargada y publicada como comentario.')
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Cargar transcripción</DialogTitle>
        <DialogDescription className="text-pretty leading-relaxed">Se guarda en el cliente, se publica como comentario y queda como contexto para Conexa.</DialogDescription>
      </DialogHeader>

      <Tabs value={mode} onValueChange={(value) => { setMode(value as 'doc' | 'manual'); setError(null) }}>
        <TabsList className="w-full">
          <TabsTrigger value="doc" className="flex-1">Google Docs</TabsTrigger>
          <TabsTrigger value="manual" className="flex-1">Archivo o texto</TabsTrigger>
        </TabsList>

        <TabsContent value="doc" className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="transcript-doc">Link del documento</Label>
          <Input id="transcript-doc" value={doc} onChange={(event) => setDoc(event.target.value)} placeholder="https://docs.google.com/document/d/…" required={mode === 'doc'} disabled={saving} aria-describedby="transcript-doc-help" />
          <p id="transcript-doc-help" className="text-xs leading-relaxed text-muted-foreground">Tiene que estar en la cuenta de Google Docs que conectaste o compartido con ella.</p>
        </TabsContent>

        <TabsContent value="manual" className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transcript-title">Título de la reunión</Label>
              <Input id="transcript-title" value={title} onChange={(event) => setTitle(event.target.value)} required={mode === 'manual'} maxLength={300} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transcript-date">Fecha <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="transcript-date" type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="transcript-content">Transcripción</Label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-within:underline">
                <FileUp className="size-3.5" aria-hidden="true" />
                {fileName ?? 'Subir .txt, .vtt, .srt o .md'}
                <input type="file" accept=".txt,.vtt,.srt,.md,text/plain,text/vtt" className="sr-only" onChange={readFile} disabled={saving} />
              </label>
            </div>
            <Textarea id="transcript-content" value={content} onChange={(event) => setContent(event.target.value)} required={mode === 'manual'} rows={8} placeholder="Pegá acá la transcripción…" className="max-h-72 font-mono text-xs leading-relaxed" disabled={saving} />
          </div>
        </TabsContent>
      </Tabs>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-relaxed text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
