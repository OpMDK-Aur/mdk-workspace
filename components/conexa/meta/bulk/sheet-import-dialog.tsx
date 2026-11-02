'use client'

import { useMemo, useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBulkStore } from '@/lib/bulk/store'
import { CTAS } from '@/lib/bulk/types'
import { BulkPlanError, buildPlanRequest, interpretSheetRequest } from '@/lib/conexa/bulk/client'
import { CANONICAL_ACTIONS, ACTION_LABELS, ROLES, ROLE_LABELS, type CanonicalAction, type InterpretResponse, type Role, type SheetInterpretation } from '@/lib/conexa/bulk/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const selectClass = 'w-full rounded-md border border-[#e5e5e0] bg-white px-2 py-1.5 text-[12px] text-[#141414] outline-none focus:border-[#5B5FE8]'

export function SheetImportDialog({ destinationUrl }: { destinationUrl?: string | null }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'reading' | 'planning' | null>(null)
  const [error, setError] = useState<{ message: string; needsGoogle: boolean } | null>(null)
  const [read, setRead] = useState<InterpretResponse | null>(null)
  const [interpretation, setInterpretation] = useState<SheetInterpretation | null>(null)
  const [filter, setFilter] = useState<{ column: string; values: string[] } | undefined>()
  const [defaults, setDefaults] = useState({ cta: CTAS[0] as string, url: destinationUrl ?? '' })
  const clientId = useBulkStore((state) => state.clientId)
  const startSheetPlan = useBulkStore((state) => state.startSheetPlan)

  const filterOptions = useMemo(() => {
    if (!read || !filter?.column) return []
    const index = read.grid.headers.indexOf(filter.column)
    return [...new Set(read.grid.rows.map((row) => row.cells[index]?.trim()).filter(Boolean))] as string[]
  }, [read, filter?.column])

  const fail = (cause: unknown, fallback: string) => setError({ message: cause instanceof Error ? cause.message : fallback, needsGoogle: cause instanceof BulkPlanError && cause.needsGoogle })

  async function interpret() {
    if (!url.trim() || !clientId) return
    setBusy('reading')
    setError(null)
    setRead(null)
    try {
      const data = await interpretSheetRequest({ clientId, url })
      setRead(data)
      setInterpretation(data.interpretation)
      setFilter(data.interpretation.suggestedRowFilter)
    } catch (cause) {
      fail(cause, 'No se pudo leer el sheet.')
    } finally {
      setBusy(null)
    }
  }

  async function buildPlan() {
    if (!interpretation || !clientId) return
    setBusy('planning')
    setError(null)
    try {
      const { context } = await buildPlanRequest({ clientId, url, interpretation, rowFilter: filter?.values.length ? filter : undefined, batchDefaults: defaults })
      startSheetPlan(context)
      setOpen(false)
      setRead(null)
      setUrl('')
    } catch (cause) {
      fail(cause, 'No se pudo armar el plan.')
    } finally {
      setBusy(null)
    }
  }

  const setRole = (header: string, role: Role) => setInterpretation((current) => current && { ...current, columns: current.columns.map((column) => (column.header === header ? { ...column, role, confidence: 1 } : column)) })
  const setVocabulary = (value: string, action: CanonicalAction) => setInterpretation((current) => current && { ...current, actionVocabulary: { ...current.actionVocabulary, [value]: action } })
  const setStatus = (key: 'done' | 'error', value: string) => setInterpretation((current) => current && { ...current, statusVocabulary: { ...current.statusVocabulary, [key]: value || undefined } })
  const toggleFilterValue = (value: string) => setFilter((current) => current && { ...current, values: current.values.includes(value) ? current.values.filter((item) => item !== value) : [...current.values, value] })

  const connectHref = typeof window === 'undefined' ? '/api/auth/google-sheets' : `/api/auth/google-sheets?return=${encodeURIComponent(window.location.pathname + window.location.search)}`
  const hasCreatives = interpretation?.columns.some((column) => column.role === 'creatives_link')
  const hasStatus = interpretation?.columns.some((column) => column.role === 'status')

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e5e0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#141414] hover:border-[#5B5FE8] hover:text-[#5B5FE8]">
        <FileSpreadsheet className="size-3.5" aria-hidden="true" />
        Importar desde Google Sheet
      </button>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-white text-[#141414]">
          <DialogHeader>
            <DialogTitle>Importar desde Google Sheet</DialogTitle>
            <DialogDescription className="text-pretty text-[#777]">
              Conexa interpreta las columnas de este cliente y arma un plan de carga contra lo que ya existe en Meta. Nada se crea hasta que lo apruebes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => { event.preventDefault(); interpret() }} className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#e5e5e0] px-3 py-2 focus-within:border-[#5B5FE8]">
              <span className="sr-only">Link del Google Sheet</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#aaa]" />
            </label>
            <button type="submit" disabled={Boolean(busy) || !url.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#141414] px-4 text-[12.5px] font-semibold text-white disabled:opacity-40">
              {busy === 'reading' && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {busy === 'reading' ? 'Interpretando…' : 'Leer sheet'}
            </button>
          </form>

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#f2d4cf] bg-[#fdf3f1] px-3 py-2 text-[12px] text-[#a8321f]" role="alert">
              <span>{error.message}</span>
              {error.needsGoogle && <a href={connectHref} className="shrink-0 rounded-full bg-[#141414] px-3 py-1 text-[11.5px] font-semibold text-white">Conectar Google</a>}
            </div>
          )}

          {read && interpretation && (
            <div className="flex flex-col gap-4">
              <p className="text-[11.5px] text-[#777]">
                {`${read.grid.title} · ${read.grid.sheetTitle} · ${read.grid.rows.length} filas · `}
                {read.reused === 'full' ? 'Interpretación guardada de este cliente' : read.reused === 'partial' ? 'Interpretación guardada, con columnas nuevas' : 'Interpretación nueva'}
                {!read.persisted && ' · no se pudo guardar (falta aplicar el SQL)'}
              </p>

              {interpretation.warnings.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-lg border border-[#f0e2c2] bg-[#fdf8ec] px-3 py-2 text-[11.5px] text-[#8a5f0d]">
                  {interpretation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}

              <fieldset className="rounded-lg border border-[#ececea] p-3">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[#999]">Columnas</legend>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
                  {interpretation.columns.map((column) => (
  <div key={column.header} className="flex min-w-0 flex-col gap-1">
  <label htmlFor={`role-${column.header}`} className="break-words text-[12px] font-medium leading-snug" title={column.note ?? undefined}>{column.header}</label>
                      <select id={`role-${column.header}`} value={column.role} onChange={(event) => setRole(column.header, event.target.value as Role)} className={cn(selectClass, column.confidence < 0.6 && 'border-[#e8c48a]')}>
                        {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {!hasCreatives && <p className="mt-2 text-[11.5px] text-[#a8321f]">Marcá qué columna tiene el link de Drive con los creativos.</p>}
              </fieldset>

              {Object.keys(interpretation.actionVocabulary).length > 0 && (
                <fieldset className="rounded-lg border border-[#ececea] p-3">
                  <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[#999]">Qué significa cada acción del sheet</legend>
  <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
  {Object.entries(interpretation.actionVocabulary).map(([value, action]) => (
  <div key={value} className="flex min-w-0 flex-col gap-1">
  <label htmlFor={`action-${value}`} className="break-words text-[12px] leading-snug">{`"${value}"`}</label>
                        <select id={`action-${value}`} value={action} onChange={(event) => setVocabulary(value, event.target.value as CanonicalAction)} className={selectClass}>
                          {CANONICAL_ACTIONS.map((item) => <option key={item} value={item}>{ACTION_LABELS[item]}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="flex flex-wrap gap-4 rounded-lg border border-[#ececea] p-3">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[#999]">Filas y valores por defecto</legend>
                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label htmlFor="row-filter" className="text-[11.5px] font-semibold">Procesar solo filas donde</label>
                  <select id="row-filter" value={filter?.column ?? ''} onChange={(event) => setFilter(event.target.value ? { column: event.target.value, values: [] } : undefined)} className={selectClass}>
                    <option value="">Todas las filas</option>
                    {read.grid.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                  {filter && (
                    <div className="flex flex-wrap gap-1.5">
                      {filterOptions.map((value) => (
                        <button key={value} type="button" onClick={() => toggleFilterValue(value)} aria-pressed={filter.values.includes(value)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px]', filter.values.includes(value) ? 'border-[#5B5FE8] bg-[#5B5FE8]/10 text-[#5B5FE8]' : 'border-[#e5e5e0] text-[#555]')}>
                          {value}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex min-w-[160px] flex-col gap-1.5">
                  <label htmlFor="default-cta" className="text-[11.5px] font-semibold">CTA si la fila no trae</label>
                  <select id="default-cta" value={defaults.cta} onChange={(event) => setDefaults({ ...defaults, cta: event.target.value })} className={selectClass}>
                    {CTAS.map((cta) => <option key={cta} value={cta}>{cta}</option>)}
                  </select>
                </div>
                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <label htmlFor="default-url" className="text-[11.5px] font-semibold">URL si la fila no trae</label>
                  <input id="default-url" value={defaults.url} onChange={(event) => setDefaults({ ...defaults, url: event.target.value })} placeholder="https://…" className={selectClass} />
                </div>
                {hasStatus && (
                  <div className="flex w-full flex-wrap gap-4">
                    <div className="flex min-w-[160px] flex-col gap-1.5">
                      <label htmlFor="status-done" className="text-[11.5px] font-semibold">Escribir en Estado al terminar</label>
                      <input id="status-done" value={interpretation.statusVocabulary.done ?? ''} onChange={(event) => setStatus('done', event.target.value)} placeholder="Ej. Subido" className={selectClass} />
                    </div>
                    <div className="flex min-w-[160px] flex-col gap-1.5">
                      <label htmlFor="status-error" className="text-[11.5px] font-semibold">Si falla</label>
                      <input id="status-error" value={interpretation.statusVocabulary.error ?? ''} onChange={(event) => setStatus('error', event.target.value)} placeholder="Ej. Error" className={selectClass} />
                    </div>
                  </div>
                )}
              </fieldset>
            </div>
          )}

          <DialogFooter className="items-center gap-3 sm:justify-between">
            <p className="text-[11.5px] text-[#777]">
              {busy === 'planning' ? 'Leyendo Drive y cruzando con Meta…' : read ? 'Podés corregir cualquier columna; queda guardado para este cliente.' : 'El sheet y las carpetas deben estar compartidos con tu cuenta de Google conectada.'}
            </p>
            <button type="button" onClick={buildPlan} disabled={!read || !hasCreatives || Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-full bg-[#141414] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40">
              {busy === 'planning' && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Armar plan de carga
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
