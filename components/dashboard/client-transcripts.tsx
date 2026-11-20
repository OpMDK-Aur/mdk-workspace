'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronDown, ExternalLink, FileText, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TranscriptUploadDialog } from './transcript-upload-dialog'

type TranscriptItem = {
  id: string
  titulo: string
  fecha_reunion: string | null
  fuente: 'google_docs' | 'manual'
  google_doc_url: string | null
  subido_por: string | null
  subido_por_nombre: string | null
  created_at: string
  extracto: string
  caracteres: number
}

type Unmatched = { docId: string; title: string; meetingDate: string | null; url: string | null }
type Notice = { tone: 'ok' | 'error'; message: string; connect?: boolean }

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? 'No se pudieron cargar las transcripciones.')
  return body
}

const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000

const syncFetcher = async ([url]: [string, string]) => {
  const response = await fetch(url, { method: 'POST' })
  return response.ok ? response.json() : null
}

const formatDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : 'Sin fecha'

export function ClientTranscripts({ clientId, currentUserId }: { clientId: string; currentUserId?: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ transcripts: TranscriptItem[] }>(`/api/clients/${clientId}/transcripts`, fetcher)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [unmatched, setUnmatched] = useState<Unmatched[]>([])
  const [linking, setLinking] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  // Al abrir la pestaña se sincroniza en segundo plano (como mucho cada 15 min por sesión),
  // así las transcripciones recién generadas aparecen sin esperar al cron diario.
  useSWR([`/api/clients/${clientId}/transcripts/sync`, 'auto'], syncFetcher, {
    dedupingInterval: AUTO_SYNC_INTERVAL_MS,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    onSuccess: (result: { createdForClient?: number; unmatched?: Unmatched[] } | null) => {
      if (!result) return
      if (result.unmatched?.length) setUnmatched(result.unmatched)
      if (result.createdForClient) mutate()
    },
  })

  const sync = async () => {
    setSyncing(true)
    setNotice(null)
    const response = await fetch(`/api/clients/${clientId}/transcripts/sync`, { method: 'POST' }).catch(() => null)
    const body = await response?.json().catch(() => ({})) ?? {}
    setSyncing(false)
    if (!response?.ok) {
      setNotice({ tone: 'error', message: body.error ?? 'No se pudo sincronizar.', connect: Boolean(body.needsConnection) })
      return
    }
    setUnmatched(body.unmatched ?? [])
    const parts = [
      body.createdForClient ? `${body.createdForClient} nueva${body.createdForClient === 1 ? '' : 's'} en este cliente` : null,
      body.createdElsewhere ? `${body.createdElsewhere} en otros clientes` : null,
    ].filter(Boolean)
    setNotice({ tone: 'ok', message: parts.length ? `Listo: ${parts.join(' y ')}.` : 'No hay transcripciones nuevas en los últimos 30 días.' })
    if (body.createdForClient) mutate()
  }

  const link = async (item: Unmatched) => {
    setLinking(item.docId)
    const response = await fetch(`/api/clients/${clientId}/transcripts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'doc', doc: item.docId }) }).catch(() => null)
    const body = await response?.json().catch(() => ({})) ?? {}
    setLinking(null)
    if (!response?.ok) {
      setNotice({ tone: 'error', message: body.error ?? 'No se pudo vincular el documento.' })
      return
    }
    setUnmatched((current) => current.filter((entry) => entry.docId !== item.docId))
    setNotice({ tone: 'ok', message: `"${item.title}" quedó cargada en este cliente.` })
    mutate()
  }

  const transcripts = data?.transcripts ?? []

  return (
    <section aria-labelledby="transcripts-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h3 id="transcripts-title" className="text-sm font-semibold text-foreground">Transcripciones de reuniones</h3>
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">Las de Google Meet se traen solas desde tu Google Docs (al abrir esta pestaña y una vez por día) y se publican como comentario. Conexa las usa como contexto.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={sync} disabled={syncing} className="h-8 gap-1.5 text-xs">
            <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} aria-hidden="true" />
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </Button>
          <Button type="button" size="sm" onClick={() => setUploadOpen(true)} className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" aria-hidden="true" />
            Cargar
          </Button>
        </div>
      </div>

      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-xs leading-relaxed', notice.tone === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border bg-muted/50 text-foreground')}>
          {notice.message}
          {notice.connect && <> <Link href="/dashboard/apps#conector-google-docs" className="font-medium underline">Ir a Conectores</Link></>}
        </p>
      )}

      {unmatched.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-medium text-foreground">No pudimos saber de qué cliente son estas transcripciones. Vinculá las de este cliente:</p>
          <ul className="flex flex-col divide-y divide-border">
            {unmatched.map((item) => (
              <li key={item.docId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.meetingDate)}</p>
                </div>
                <Button type="button" size="sm" variant="secondary" className="h-7 shrink-0 text-xs" onClick={() => link(item)} disabled={linking !== null}>
                  {linking === item.docId ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : 'Vincular a este cliente'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando transcripciones">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">{error.message}</p>
      ) : transcripts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Todavía no hay transcripciones</p>
          <p className="max-w-sm text-pretty text-xs leading-relaxed text-muted-foreground">Sincronizá tu Google Docs o cargá una a mano.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {transcripts.map((item) => (
            <TranscriptRow key={item.id} clientId={clientId} item={item} canDelete={item.subido_por === currentUserId} onDeleted={() => mutate()} />
          ))}
        </ul>
      )}

      <TranscriptUploadDialog
        clientId={clientId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSaved={(message) => {
          setUploadOpen(false)
          setNotice({ tone: 'ok', message })
          mutate()
        }}
      />
    </section>
  )
}

function TranscriptRow({ clientId, item, canDelete, onDeleted }: { clientId: string; item: TranscriptItem; canDelete: boolean; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { data, isLoading } = useSWR<{ transcript: { contenido: string } }>(open ? `/api/clients/${clientId}/transcripts/${item.id}` : null, fetcher)
  const contentId = `transcript-${item.id}`

  const remove = async () => {
    if (!window.confirm('¿Borrar esta transcripción y su comentario?')) return
    setDeleting(true)
    const response = await fetch(`/api/clients/${clientId}/transcripts/${item.id}`, { method: 'DELETE' }).catch(() => null)
    setDeleting(false)
    if (response?.ok) onDeleted()
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-medium text-foreground">{item.titulo}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDate(item.fecha_reunion)}</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">{item.fuente === 'google_docs' ? 'Google Docs' : 'Carga manual'}</Badge>
            {item.subido_por_nombre && <span>{`por ${item.subido_por_nombre}`}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.google_doc_url && (
            <Button asChild variant="ghost" size="icon" className="size-7">
              <a href={item.google_doc_url} target="_blank" rel="noreferrer" aria-label={`Abrir "${item.titulo}" en Google Docs`}>
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </Button>
          )}
          {canDelete && (
            <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={remove} disabled={deleting} aria-label={`Borrar "${item.titulo}"`}>
              {deleting ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
            </Button>
          )}
        </div>
      </div>

      {open ? (
        <div id={contentId} className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-foreground">
          {isLoading ? 'Cargando…' : data?.transcript.contenido}
        </div>
      ) : (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.extracto}</p>
      )}

      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={contentId} className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline">
        {open ? 'Ocultar' : `Ver completa (${Math.max(1, Math.round(item.caracteres / 1000))}k caracteres)`}
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
    </li>
  )
}
