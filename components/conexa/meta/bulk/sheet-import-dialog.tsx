'use client'

import { useMemo, useState } from 'react'
import { FileSpreadsheet, FolderOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildSheetEntries, loadMapping, MAPPING_FIELDS, planRows, readSheet, saveMapping, SheetReadError, suggestMapping, type MappingField, type NameSource, type SheetMapping } from '@/lib/bulk/sheet-client'
import { useBulkStore } from '@/lib/bulk/store'
import type { BulkAdset, SheetGrid } from '@/lib/bulk/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const selectClass = 'w-full rounded-md border border-[#e5e5e0] bg-white px-2 py-1.5 text-[12px] text-[#141414] outline-none focus:border-[#5B5FE8]'

function ColumnSelect({ id, value, headers, onChange }: { id: string; value?: string; headers: string[]; onChange: (value: string | undefined) => void }) {
  return (
    <select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)} className={selectClass}>
      <option value="">— No usar —</option>
      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
    </select>
  )
}

export function SheetImportDialog({ adsets }: { adsets: BulkAdset[] }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<{ message: string; needsGoogle: boolean } | null>(null)
  const [grid, setGrid] = useState<SheetGrid | null>(null)
  const [mapping, setMapping] = useState<SheetMapping | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [adsetOverrides, setAdsetOverrides] = useState<Record<number, string>>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const clientId = useBulkStore((state) => state.clientId)
  const addSheetRows = useBulkStore((state) => state.addSheetRows)

  const planned = useMemo(() => (grid && mapping ? planRows(grid, mapping, adsets) : []), [grid, mapping, adsets])
  const rows = planned.map((row) => ({ ...row, adsetId: adsetOverrides[row.rowNumber] ?? row.adsetId }))
  const importable = rows.filter((row) => !excluded.has(row.rowNumber) && row.driveIds.length && row.adsetId)
  const filterValues = useMemo(() => {
    if (!grid || !mapping?.filter?.column) return []
    const index = grid.headers.indexOf(mapping.filter.column)
    return [...new Set(grid.rows.map((row) => row.cells[index]).filter(Boolean))]
  }, [grid, mapping?.filter?.column])

  async function read() {
    if (!url.trim()) return
    setReading(true)
    setError(null)
    setNotice(null)
    setGrid(null)
    try {
      const data = await readSheet(url)
      setGrid(data)
      setMapping(loadMapping(clientId, data) ?? suggestMapping(data, adsets))
      setExcluded(new Set())
      setAdsetOverrides({})
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : 'No se pudo leer el sheet.', needsGoogle: cause instanceof SheetReadError && cause.needsGoogle })
    } finally {
      setReading(false)
    }
  }

  const setColumn = (field: MappingField, header: string | undefined) => setMapping((current) => current && { ...current, columns: { ...current.columns, [field]: header } })

  function setName(value: string) {
    const name: NameSource = value === '__today' ? { mode: 'today' } : value === '__file' ? { mode: 'file' } : { mode: 'column', column: value }
    setMapping((current) => current && { ...current, name })
  }

  function toggle(rowNumber: number) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  async function importRows() {
    if (!mapping || !importable.length) return
    setError(null)
    try {
      const { entries, failed, empty } = await buildSheetEntries(importable, mapping.split, (done, total) => setProgress({ done, total }))
      setProgress(null)
      if (!entries.length) {
        setError({ message: empty[0] ? `Fila ${empty[0].rowNumber}: ${empty[0].reason}` : 'No se pudo descargar ningún archivo de Drive.', needsGoogle: false })
        return
      }
      saveMapping(clientId, mapping)
      addSheetRows(entries)
      const issues = [failed && `${failed} archivos no se pudieron descargar`, empty.length && `${empty.length} filas sin creativos`].filter(Boolean)
      setNotice(issues.length ? issues.join(' · ') : null)
      setOpen(false)
      setGrid(null)
      setUrl('')
    } catch (cause) {
      setProgress(null)
      setError({ message: cause instanceof Error ? cause.message : 'No se pudo importar.', needsGoogle: cause instanceof SheetReadError && cause.needsGoogle })
    }
  }

  const connectHref = typeof window === 'undefined' ? '/api/auth/google-sheets' : `/api/auth/google-sheets?return=${encodeURIComponent(window.location.pathname + window.location.search)}`
  const nameValue = mapping?.name.mode === 'column' ? mapping.name.column : mapping?.name.mode === 'file' ? '__file' : '__today'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]">
        <FileSpreadsheet className="size-3.5" aria-hidden="true" />
        Importar desde Google Sheet
      </button>
      {notice && <span className="text-[11.5px] text-[#b07a12]" role="status">{notice}</span>}
      <Dialog open={open} onOpenChange={(next) => { if (!progress) setOpen(next) }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto bg-white text-[#141414]">
          <DialogHeader>
            <DialogTitle>Importar desde Google Sheet</DialogTitle>
            <DialogDescription className="text-pretty text-[#777]">
              Cada cliente arma su sheet distinto: elegí qué columna corresponde a cada dato. El mapeo queda guardado para este cliente.
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

          {grid && mapping && (
            <div className="flex flex-col gap-4">
              <p className="text-[11.5px] text-[#777]">{`${grid.title} · ${grid.sheetTitle} · ${grid.rows.length} filas · ${grid.headers.length} columnas`}</p>

              <fieldset className="flex flex-col gap-3 rounded-lg border border-[#ececea] p-3">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[#999]">Mapeo de columnas</legend>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="map-name" className="text-[11.5px] font-semibold">Nombre del anuncio</label>
                    <select id="map-name" value={nameValue} onChange={(event) => setName(event.target.value)} className={selectClass}>
                      <option value="__today">Fecha de creación (hoy)</option>
                      <option value="__file">Nombre del archivo</option>
                      {grid.headers.map((header) => <option key={header} value={header}>{`Columna: ${header}`}</option>)}
                    </select>
                  </div>
                  {MAPPING_FIELDS.map((field) => (
                    <div key={field.key} className="flex flex-col gap-1">
                      <label htmlFor={`map-${field.key}`} className="text-[11.5px] font-semibold">{field.label}</label>
                      <ColumnSelect id={`map-${field.key}`} value={mapping.columns[field.key]} headers={grid.headers} onChange={(header) => setColumn(field.key, header)} />
                      <span className="text-[10.5px] text-[#999]">{field.hint}</span>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label htmlFor="map-split" className="text-[11.5px] font-semibold">Anuncios por fila</label>
                    <select id="map-split" value={mapping.split} onChange={(event) => setMapping({ ...mapping, split: event.target.value as SheetMapping['split'] })} className={selectClass}>
                      <option value="piece">Uno por pieza de la carpeta</option>
                      <option value="row">Uno por fila (todo junto)</option>
                    </select>
                    <span className="text-[10.5px] text-[#999]">{'Agrupa formatos de la misma pieza (ej. _1x1 y _9x16)'}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3 border-t border-[#f0f0ed] pt-3">
                  <div className="flex min-w-[180px] flex-col gap-1">
                    <label htmlFor="map-filter" className="text-[11.5px] font-semibold">Filtrar filas por</label>
                    <ColumnSelect id="map-filter" value={mapping.filter?.column} headers={grid.headers} onChange={(column) => setMapping({ ...mapping, filter: column ? { column, value: '' } : undefined })} />
                  </div>
                  {mapping.filter && (
                    <div className="flex min-w-[180px] flex-col gap-1">
                      <label htmlFor="map-filter-value" className="text-[11.5px] font-semibold">Valor</label>
                      <select id="map-filter-value" value={mapping.filter.value} onChange={(event) => setMapping({ ...mapping, filter: { column: mapping.filter!.column, value: event.target.value } })} className={selectClass}>
                        <option value="">Todas</option>
                        {filterValues.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </fieldset>

              <div className="max-h-[320px] overflow-auto rounded-lg border border-[#ececea]">
                <table className="w-full min-w-[820px] text-left text-[12px]">
                  <thead className="sticky top-0 bg-[#fafaf8] text-[10.5px] uppercase tracking-wide text-[#999]">
                    <tr>
                      <th className="w-8 px-3 py-2"><span className="sr-only">Incluir</span></th>
                      <th className="px-2 py-2 font-semibold">Fila</th>
                      <th className="px-2 py-2 font-semibold">Anuncio</th>
                      <th className="px-2 py-2 font-semibold">Campaña</th>
                      <th className="px-2 py-2 font-semibold">Conjunto</th>
                      <th className="px-2 py-2 font-semibold">Copy / Título</th>
                      <th className="px-2 py-2 font-semibold">Drive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const ready = Boolean(row.driveIds.length && row.adsetId)
                      return (
                        <tr key={row.rowNumber} className={cn('border-t border-[#f0f0ed] align-top', (!ready || excluded.has(row.rowNumber)) && 'opacity-55')}>
                          <td className="px-3 py-2">
                            <input type="checkbox" disabled={!ready} checked={ready && !excluded.has(row.rowNumber)} onChange={() => toggle(row.rowNumber)} aria-label={`Incluir fila ${row.rowNumber}`} className="accent-[#5B5FE8]" />
                          </td>
                          <td className="px-2 py-2 font-mono text-[11px] text-[#999]">{row.rowNumber}</td>
                          <td className="max-w-[130px] truncate px-2 py-2 font-medium">{row.name || <span className="text-[#999]">nombre del archivo</span>}</td>
                          <td className="max-w-[220px] px-2 py-2">
                            {row.campaign ? <span className="line-clamp-2 text-[#141414]">{row.campaign.name}</span> : row.campaignLabel ? <span className="line-clamp-2 text-[#b07a12]">{`${row.campaignLabel} (no está en la cuenta)`}</span> : <span className="text-[#999]">—</span>}
                          </td>
                          <td className="w-[200px] px-2 py-2">
                            <label className="sr-only" htmlFor={`adset-${row.rowNumber}`}>{`Conjunto fila ${row.rowNumber}`}</label>
                            <select id={`adset-${row.rowNumber}`} value={row.adsetId ?? ''} onChange={(event) => setAdsetOverrides((current) => ({ ...current, [row.rowNumber]: event.target.value }))} className={cn(selectClass, !row.adsetId && 'border-[#e8c48a]')}>
                              <option value="">Elegir conjunto…</option>
                              {row.adsetOptions.map((adset) => <option key={adset.id} value={adset.id}>{row.campaign ? adset.name : `${adset.campaignName} › ${adset.name}`}</option>)}
                            </select>
                          </td>
                          <td className="max-w-[200px] px-2 py-2 text-[#444]">
                            {row.primaryText || row.headline ? <span className="line-clamp-2">{[row.headline, row.primaryText].filter(Boolean).join(' — ')}</span> : <span className="text-[#999]">Se completa después</span>}
                          </td>
                          <td className="px-2 py-2">
                            {row.driveIds.length ? (
                              <span className="inline-flex items-center gap-1 text-[#333]">
                                <FolderOpen className="size-3.5 text-[#5B5FE8]" aria-hidden="true" />
                                {row.driveIds.length === 1 ? 'Link' : `${row.driveIds.length} links`}
                              </span>
                            ) : <span className="text-[#a8321f]">Sin link</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {!rows.length && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-[#999]">Ninguna fila coincide con el filtro.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter className="items-center gap-3 sm:justify-between">
            <p className="text-[11.5px] text-[#777]">
              {progress ? `Descargando de Drive ${progress.done}/${progress.total}…` : grid ? `${importable.length} filas listas · los anuncios se arman según las piezas de cada carpeta` : 'El sheet y los archivos deben estar compartidos con tu cuenta de Google conectada.'}
            </p>
            <button type="button" onClick={importRows} disabled={!importable.length || Boolean(progress)} className="inline-flex items-center gap-1.5 rounded-full bg-[#141414] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">
              {progress && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {`Importar ${importable.length} filas`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
