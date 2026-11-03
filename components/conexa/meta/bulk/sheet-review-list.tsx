'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { fetchReview, reviewUrl, setReviewRequest, type ReviewListItem } from '@/lib/conexa/bulk/client'

function ExcludeControl({ onExclude, busy }: { onExclude: (note: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  if (!open) {
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)} className="text-[11px] font-medium text-[#c0432c] underline-offset-2 hover:underline disabled:opacity-40">
        Excluir
      </button>
    )
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        onExclude(note.trim())
      }}
    >
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Motivo (opcional)"
        aria-label="Motivo de la exclusión"
        className="h-7 w-40 rounded-md border border-[#e5e5e0] bg-white px-2 text-[11.5px] text-[#141414] outline-none focus:border-[#5B5FE8]"
      />
      <button type="submit" disabled={busy} className="rounded-full bg-[#c0432c] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">Excluir</button>
      <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-[#777] hover:text-[#141414]">Cancelar</button>
    </form>
  )
}

function ReviewRow({ item, busy, onChange }: { item: ReviewListItem; busy: boolean; onChange: (status: ReviewListItem['reviewStatus'], note?: string) => void }) {
  const excluded = item.reviewStatus === 'excluded'
  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', excluded && 'bg-[#fafaf8]')}>
      {item.thumbnail ? (
        <img src={item.thumbnail || '/placeholder.svg'} alt="" className={cn('size-11 shrink-0 rounded-md border border-[#ececea] object-cover', excluded && 'opacity-40')} />
      ) : (
        <span className="size-11 shrink-0 rounded-md border border-dashed border-[#dcdcd8]" aria-hidden="true" />
      )}
      <div className="flex min-w-[220px] flex-1 flex-col">
        <span className={cn('truncate text-[12.5px] font-medium text-[#141414]', excluded && 'text-[#999] line-through')}>{item.name}</span>
        <span className="truncate text-[11px] text-[#777]">{item.destination}</span>
        <span className="text-[10.5px] text-[#999]">
          {`Fila ${item.rowNumber} · ID ${item.adId}${item.metaStatus ? ` · ${item.metaStatus}` : ''}${excluded ? ` · Excluido${item.reviewNote ? `: ${item.reviewNote}` : ''}` : ''}`}
        </span>
      </div>
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#5B5FE8] hover:underline">
          Abrir en Ads Manager
          <ExternalLink className="size-3" aria-hidden="true" />
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
      )}
      {excluded ? (
        <button type="button" disabled={busy} onClick={() => onChange('pending')} className="text-[11px] text-[#555] underline-offset-2 hover:underline disabled:opacity-40">Volver a incluir</button>
      ) : (
        <>
          <label className="flex items-center gap-1.5 text-[11.5px] text-[#141414]">
            <input type="checkbox" checked={item.reviewStatus === 'ok'} disabled={busy} onChange={(event) => onChange(event.target.checked ? 'ok' : 'pending')} className="accent-[#1e9e6b]" />
            Revisado OK
          </label>
          <ExcludeControl busy={busy} onExclude={(note) => onChange('excluded', note)} />
        </>
      )}
      {busy && <Loader2 className="size-3.5 animate-spin text-[#999]" aria-label="Guardando" />}
    </li>
  )
}

/** Review of the ads created in this batch. The state is saved per ad, so the review can be resumed later. */
export function SheetReviewList({ planId, clientId }: { planId: string; clientId: string }) {
  const key = reviewUrl(planId, clientId)
  const { data, error, isLoading, mutate } = useSWR(key, fetchReview)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const items = data?.items ?? []
  const reviewed = items.filter((item) => item.reviewStatus !== 'pending').length

  async function change(item: ReviewListItem, status: ReviewListItem['reviewStatus'], note?: string) {
    setBusy(item.idempotencyKey)
    setActionError(null)
    try {
      await setReviewRequest(planId, { clientId, idempotencyKey: item.idempotencyKey, status, note })
      await mutate({ items: items.map((current) => (current.idempotencyKey === item.idempotencyKey ? { ...current, reviewStatus: status, reviewNote: status === 'excluded' ? note || null : null } : current)) }, { revalidate: false })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo guardar la revisión.')
    } finally {
      setBusy(null)
    }
  }

  async function copyLinks() {
    const links = items.filter((item) => item.url && item.reviewStatus !== 'excluded').map((item) => `${item.name}\t${item.url}`).join('\n')
    try {
      await navigator.clipboard.writeText(links)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setActionError('No se pudieron copiar los links.')
    }
  }

  return (
    <section aria-labelledby="review-title" className="rounded-xl border border-[#ececea] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0ed] px-4 py-2.5">
        <div className="flex flex-col">
          <h3 id="review-title" className="text-[13px] font-semibold text-[#141414]">Revisión en Ads Manager</h3>
          <span className="text-[11px] text-[#777]" role="status">{isLoading ? 'Cargando…' : `${reviewed} de ${items.length} revisados`}</span>
        </div>
        <Button size="sm" variant="outline" disabled={!items.length} onClick={copyLinks} className="h-8 rounded-full border-[#dcdcd8] bg-white px-3 text-[11px] text-[#333] hover:bg-[#f5f5f3]">
          {copied ? <><Check className="size-3.5" aria-hidden="true" /> Copiados</> : 'Copiar todos los links'}
        </Button>
      </header>
      {error && <p className="px-4 py-3 text-[11.5px] text-[#c0432c]" role="alert">{error instanceof Error ? error.message : 'No se pudo cargar la revisión.'}</p>}
      {actionError && <p className="px-4 pt-2 text-[11.5px] text-[#c0432c]" role="alert">{actionError}</p>}
      {!isLoading && !error && !items.length && <p className="px-4 py-3 text-[11.5px] text-[#777]">Todavía no hay anuncios creados en este lote.</p>}
      <ul className="divide-y divide-[#f3f3f0]">
        {items.map((item) => <ReviewRow key={item.idempotencyKey} item={item} busy={busy === item.idempotencyKey} onChange={(status, note) => change(item, status, note)} />)}
      </ul>
    </section>
  )
}
