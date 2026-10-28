'use client'

import { useState } from 'react'
import { FileSpreadsheet, FolderOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildSheetEntries, matchAdset, readSheet, SheetReadError } from '@/lib/bulk/sheet-client'
import { useBulkStore } from '@/lib/bulk/store'
import type { BulkAdset, SheetImportResult } from '@/lib/bulk/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function SheetImportDialog({ adsets }: { adsets: BulkAdset[] }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<{ message: string; needsGoogle: boolean } | null>(null)
  const [result, setResult] = useState<SheetImportResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const addSheetRows = useBulkStore((state) => state.addSheetRows)

  async function read() {
    if (!url.trim()) return
    setReading(true)
    setError(null)
    setResult(null)
    try {
      const data = await readSheet(url)
      setResult(data)
      setSelected(new Set(data.rows.filter((row) => row.files.length).map((row) => row.rowNumber)))
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : 'No se pudo leer el sheet.', needsGoogle: cause instanceof SheetReadError && cause.needsGoogle })
    } finally {
      setReading(false)
    }
  }

  function toggle(rowNumber: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  async function importRows() {
    if (!result) return
    const rows = result.rows.filter((row) => selected.has(row.rowNumber) && row.files.length)
    const { entries, failed } = await buildSheetEntries(rows, adsets, (done, total) => setProgress({ done, total }))
    setProgress(null)
    if (failed && !entries.length) {
      setError({ message: 'No se pudo descargar ningún archivo de Drive.', needsGoogle: false })
      return
    }
    addSheetRows(entries)
    setOpen(false)
    setResult(null)
    setUrl('')
  }

  const connectHref = typeof window === 'undefined' ? '/api/auth/google-sheets' : `/api/auth/google-sheets?return=${encodeURIComponent(window.location.pathname + window.location.search)}`
  const importable = result?.rows.filter((row) => selected.has(row.rowNumber) && row.files.length) ?? []
  const fileCount = importable.reduce((sum, row) => sum + row.files.length, 0)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]">
        <FileSpreadsheet className="size-3.5" aria-hidden="true" />
        Importar desde Google Sheet
      </button>
      <Dialog open={open} onOpenChange={(next) => { if (!progress) setOpen(next) }}>
        <DialogContent className="max-w-4xl bg-white text-[#141414]">
          <DialogHeader>
            <DialogTitle>Importar desde Google Sheet</DialogTitle>
            <DialogDescription className="text-pretty text-[#777]">
              Cada fila es un anuncio. Leo las columnas Anuncio, Texto principal, Título, CTA y Conjunto, y descargo las imágenes o videos del link de Drive de la fila (archivo o carpeta).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => { event.preventDefault(); read() }} className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#e5e5e0] px-3 py-2 focus-within:border-[#5B5FE8]">
              <span className="sr-only">Link del Google Sheet</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#aaa]" />
            </label>
            <button type="submit" disabled={reading || !url.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#141414] px-4 text-[12.5px] font-semibold text-white disabled:opacity-40">
              {reading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {reading ? 'Leyendo…' : 'Leer sheet'}
            </button>
          </form>

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#f2d4cf] bg-[#fdf3f1] px-3 py-2 text-[12px] text-[#a8321f]" role="alert">
              <span>{error.message}</span>
              {error.needsGoogle && <a href={connectHref} className="shrink-0 rounded-full bg-[#141414] px-3 py-1 text-[11.5px] font-semibold text-white">Conectar Google</a>}
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-2">
              <p className="text-[11.5px] text-[#777]">{`${result.title} · ${result.sheetTitle} · ${result.rows.length} filas`}</p>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-[#ececea]">
                <table className="w-full min-w-[720px] text-left text-[12px]">
                  <thead className="sticky top-0 bg-[#fafaf8] text-[10.5px] uppercase tracking-wide text-[#999]">
                    <tr>
                      <th className="w-8 px-3 py-2"><span className="sr-only">Incluir</span></th>
                      <th className="px-2 py-2 font-semibold">Fila</th>
                      <th className="px-2 py-2 font-semibold">Anuncio</th>
                      <th className="px-2 py-2 font-semibold">Texto principal</th>
                      <th className="px-2 py-2 font-semibold">Título</th>
                      <th className="px-2 py-2 font-semibold">Conjunto</th>
                      <th className="px-2 py-2 font-semibold">Drive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => {
                      const disabled = !row.files.length
                      const adset = matchAdset(row.adsetName, adsets)
                      return (
                        <tr key={row.rowNumber} className={cn('border-t border-[#f0f0ed] align-top', disabled && 'opacity-55')}>
                          <td className="px-3 py-2">
                            <input type="checkbox" disabled={disabled} checked={selected.has(row.rowNumber)} onChange={() => toggle(row.rowNumber)} aria-label={`Incluir fila ${row.rowNumber}`} className="accent-[#5B5FE8]" />
                          </td>
                          <td className="px-2 py-2 font-mono text-[11px] text-[#999]">{row.rowNumber}</td>
                          <td className="max-w-[140px] truncate px-2 py-2 font-medium">{row.name || '—'}</td>
                          <td className="max-w-[220px] px-2 py-2 text-[#444]"><span className="line-clamp-2">{row.primaryText || '—'}</span></td>
                          <td className="max-w-[140px] truncate px-2 py-2 text-[#444]">{row.headline || '—'}</td>
                          <td className="max-w-[130px] truncate px-2 py-2 text-[#444]">
                            {row.adsetName ? (adset ? adset.name : <span className="text-[#b07a12]">{`${row.adsetName} (no encontrado)`}</span>) : '—'}
                          </td>
                          <td className="px-2 py-2">
                            {row.error ? (
                              <span className="text-[#a8321f]">{row.error}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[#333]">
                                <FolderOpen className="size-3.5 text-[#5B5FE8]" aria-hidden="true" />
                                {`${row.files.length} archivo${row.files.length === 1 ? '' : 's'}`}
                                {row.skipped > 0 && <span className="text-[#999]">{` · ${row.skipped} omitidos`}</span>}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter className="items-center gap-3 sm:justify-between">
            <p className="text-[11.5px] text-[#777]">
              {progress ? `Descargando de Drive ${progress.done}/${progress.total}…` : result ? `${importable.length} anuncios · ${fileCount} archivos` : 'El sheet y los archivos deben estar compartidos con tu cuenta de Google conectada.'}
            </p>
            <button type="button" onClick={importRows} disabled={!importable.length || Boolean(progress)} className="inline-flex items-center gap-1.5 rounded-full bg-[#141414] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">
              {progress && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {`Importar ${importable.length} anuncios`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
