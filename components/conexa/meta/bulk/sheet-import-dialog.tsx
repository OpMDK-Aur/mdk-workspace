'use client'

import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { useBulkStore } from '@/lib/bulk/store'
import { CTAS } from '@/lib/bulk/types'
import { BulkPlanError, buildPlanRequest, interpretSheetRequest } from '@/lib/conexa/bulk/client'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function SheetImportDialog({ destinationUrl }: { destinationUrl?: string | null }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'reading' | 'planning' | null>(null)
  const [error, setError] = useState<{ message: string; needsGoogle: boolean } | null>(null)
  const clientId = useBulkStore((state) => state.clientId)
  const startSheetPlan = useBulkStore((state) => state.startSheetPlan)

  const fail = (cause: unknown, fallback: string) => setError({ message: cause instanceof Error ? cause.message : fallback, needsGoogle: cause instanceof BulkPlanError && cause.needsGoogle })

  async function importSheet() {
    if (!url.trim() || !clientId) return
    setBusy('reading')
    setError(null)
    try {
      const { interpretation } = await interpretSheetRequest({ clientId, url })
      if (!interpretation.columns.some((column) => column.role === 'creatives_link')) {
        throw new Error('No se encontró una columna con el link de Drive de los creativos.')
      }
      setBusy('planning')
      const filter = interpretation.suggestedRowFilter
      const { context } = await buildPlanRequest({
        clientId,
        url,
        interpretation,
        rowFilter: filter?.values.length ? filter : undefined,
        batchDefaults: { cta: CTAS[0], url: destinationUrl ?? '' },
      })
      startSheetPlan(context)
      setOpen(false)
      setUrl('')
    } catch (cause) {
      fail(cause, 'No se pudo importar el sheet.')
    } finally {
      setBusy(null)
    }
  }

  const connectHref = typeof window === 'undefined' ? '/api/auth/google-sheets' : `/api/auth/google-sheets?return=${encodeURIComponent(window.location.pathname + window.location.search)}`

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]">
        <FileSpreadsheet className="size-3.5" aria-hidden="true" />
        Importar desde Google Sheet
      </button>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-white text-[#141414]">
          <DialogHeader>
            <DialogTitle>Importar desde Google Sheet</DialogTitle>
            <DialogDescription className="text-pretty text-[#777]">
              Conexa interpreta las columnas de este cliente y arma un plan de carga contra lo que ya existe en Meta. Nada se crea hasta que lo apruebes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => { event.preventDefault(); importSheet() }} className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#e5e5e0] px-3 py-2 focus-within:border-[#5B5FE8]">
              <span className="sr-only">Link del Google Sheet</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} disabled={Boolean(busy)} placeholder="https://docs.google.com/spreadsheets/d/…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#aaa]" />
            </label>
            <button type="submit" disabled={Boolean(busy) || !url.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#141414] px-4 text-[12.5px] font-semibold text-white disabled:opacity-40">
              {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {busy ? 'Procesando…' : 'Armar plan de carga'}
            </button>
          </form>

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#f2d4cf] bg-[#fdf3f1] px-3 py-2 text-[12px] text-[#a8321f]" role="alert">
              <span>{error.message}</span>
              {error.needsGoogle && <a href={connectHref} className="shrink-0 rounded-full bg-[#141414] px-3 py-1 text-[11.5px] font-semibold text-white">Conectar Google</a>}
            </div>
          )}

          <DialogFooter className="sm:justify-start">
            <p className="text-[11.5px] text-[#777]" aria-live="polite">
              {busy === 'reading' ? 'Interpretando el sheet…' : busy === 'planning' ? 'Leyendo Drive y cruzando con Meta…' : 'El sheet y las carpetas deben estar compartidos con tu cuenta de Google conectada.'}
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
