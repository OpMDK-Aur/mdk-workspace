'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { Check, ChevronDown, LoaderCircle, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DashboardFilters = { platforms: string[]; accounts: string[]; pages: string[]; regions: string[] }
export type DashboardFilterDimension = keyof DashboardFilters
export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = { platforms: [], accounts: [], pages: [], regions: [] }

type FilterOptionsResponse = { accounts: Array<{ platform: 'meta' | 'google'; id: string; name: string }>; pages: Array<{ id: string; name: string }>; regions: string[] }
type Option = { value: string; label: string; detail?: string }

const DIMENSIONS: Array<{ key: DashboardFilterDimension; label: string; hint?: string }> = [
  { key: 'platforms', label: 'Plataforma' },
  { key: 'accounts', label: 'Cuenta publicitaria', hint: 'Se filtran solo las plataformas con cuentas elegidas.' },
  { key: 'pages', label: 'Fanpage', hint: 'Aplica a Meta Ads.' },
  { key: 'regions', label: 'Ubicación', hint: 'Regiones con entrega en Meta Ads en el período.' },
]

/** Cuenta seleccionada como `plataforma:id`, igual que la clave que usa la ruta de datos. */
export const accountSelection = (accounts: string[]) => accounts.reduce<Record<string, string[]>>((selection, value) => {
  const [platform, id] = value.split(':')
  if (platform && id) selection[platform] = [...(selection[platform] ?? []), id]
  return selection
}, {})

const fetchOptions = async ([url, clientId, period, from, to]: [string, string, string, string, string]) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, period, customRange: { from, to } }) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'No se pudieron cargar los filtros.')
  return payload as FilterOptionsResponse
}

type Props = {
  clientId: string | null
  period: string
  customRange: { from: string; to: string }
  periodSelector: ReactNode
  platforms: Array<{ key: string; name: string; connected: boolean }>
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
}

export function DashboardFilterBar({ clientId, period, customRange, periodSelector, platforms, filters, onChange }: Props) {
  const [added, setAdded] = useState<DashboardFilterDimension[]>([])
  const [editing, setEditing] = useState<DashboardFilterDimension | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const needsOptions = added.some((key) => key !== 'platforms') || DIMENSIONS.some(({ key }) => key !== 'platforms' && filters[key].length > 0)
  const { data, error, isLoading } = useSWR(clientId && needsOptions ? ['/api/conexa/dashboard/filter-options', clientId, period, customRange.from, customRange.to] as [string, string, string, string, string] : null, fetchOptions, { revalidateOnFocus: false, keepPreviousData: true })

  useEffect(() => { setAdded([]); setEditing(null) }, [clientId])
  useEffect(() => {
    if (!editing && !addOpen) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !barRef.current?.contains(event.target as Node)) { setEditing(null); setAddOpen(false) }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [editing, addOpen])

  const options = useMemo<Record<DashboardFilterDimension, Option[]>>(() => ({
    platforms: platforms.filter((platform) => platform.connected).map((platform) => ({ value: platform.key, label: platform.name })),
    accounts: (data?.accounts ?? []).filter((account) => !filters.platforms.length || filters.platforms.includes(account.platform)).map((account) => ({ value: `${account.platform}:${account.id}`, label: account.name, detail: account.platform === 'meta' ? 'Meta Ads' : 'Google Ads' })),
    pages: (data?.pages ?? []).map((page) => ({ value: page.id, label: page.name })),
    regions: (data?.regions ?? []).map((region) => ({ value: region, label: region })),
  }), [data, platforms, filters.platforms])

  const visible = DIMENSIONS.filter(({ key }) => added.includes(key) || filters[key].length > 0)
  const available = DIMENSIONS.filter(({ key }) => !visible.some((item) => item.key === key))
  const labelFor = (key: DashboardFilterDimension, value: string) => options[key].find((option) => option.value === value)?.label ?? (key === 'accounts' ? value.split(':')[1] : value)
  const summary = (key: DashboardFilterDimension) => {
    const values = filters[key]
    if (!values.length) return 'Todas'
    return values.length === 1 ? labelFor(key, values[0]) : `${labelFor(key, values[0])} +${values.length - 1}`
  }
  const remove = (key: DashboardFilterDimension) => { setAdded((current) => current.filter((item) => item !== key)); setEditing(null); if (filters[key].length) onChange({ ...filters, [key]: [] }) }
  const toggle = (key: DashboardFilterDimension, value: string) => onChange({ ...filters, [key]: filters[key].includes(value) ? filters[key].filter((item) => item !== value) : [...filters[key], value] })
  const activeCount = DIMENSIONS.filter(({ key }) => filters[key].length > 0).length

  return (
    <div ref={barRef} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e7e7e5] bg-white px-3 py-2" role="toolbar" aria-label="Filtros del tablero">
      {periodSelector}
      {visible.map(({ key, label, hint }) => (
        <div key={key} className="relative">
          <div className={cn('flex items-center rounded-lg border text-[11px]', filters[key].length ? 'border-[#fbc59b] bg-[#fff5ec] text-[#7a3d0f]' : 'border-[#e6e6e3] bg-white text-[#5c5c5c]')}>
            <button type="button" onClick={() => { setEditing((current) => current === key ? null : key); setAddOpen(false) }} aria-expanded={editing === key} aria-haspopup="listbox" className="flex max-w-[220px] items-center gap-1 py-1.5 pl-2.5 pr-1.5">
              <span className="font-semibold">{label}:</span>
              <span className="truncate">{summary(key)}</span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
            <button type="button" onClick={() => remove(key)} aria-label={`Quitar filtro ${label}`} className="rounded-r-lg py-1.5 pl-1 pr-2 opacity-60 hover:opacity-100"><X className="size-3" /></button>
          </div>
          {editing === key && <FilterMenu label={label} hint={hint} options={options[key]} selected={filters[key]} loading={key !== 'platforms' && isLoading && !data} error={key !== 'platforms' && error ? error.message : null} onToggle={(value) => toggle(key, value)} onClear={() => onChange({ ...filters, [key]: [] })} />}
        </div>
      ))}
      {available.length > 0 && (
        <div className="relative">
          <button type="button" onClick={() => { setAddOpen((open) => !open); setEditing(null) }} aria-expanded={addOpen} className="flex items-center gap-1 rounded-lg border border-dashed border-[#d9d9d6] px-2.5 py-1.5 text-[11px] font-medium text-[#666] hover:border-[#F97316] hover:text-[#c2560c]"><Plus className="size-3" />Filtro</button>
          {addOpen && (
            <div className="absolute left-0 top-9 z-50 min-w-[190px] rounded-[10px] border border-[#e6e6e3] bg-white p-1.5 shadow-lg">
              {available.map(({ key, label }) => <button type="button" key={key} onClick={() => { setAdded((current) => [...current, key]); setAddOpen(false); setEditing(key) }} className="block w-full rounded-md px-2.5 py-2 text-left text-[12px] hover:bg-[#f5f5f5]">{label}</button>)}
            </div>
          )}
        </div>
      )}
      {activeCount > 0 && <button type="button" onClick={() => { onChange(EMPTY_DASHBOARD_FILTERS); setAdded([]); setEditing(null) }} className="ml-auto text-[10px] text-[#888] underline underline-offset-2 hover:text-[#444]">Limpiar filtros</button>}
    </div>
  )
}

function FilterMenu({ label, hint, options, selected, loading, error, onToggle, onClear }: { label: string; hint?: string; options: Option[]; selected: string[]; loading: boolean; error: string | null; onToggle: (value: string) => void; onClear: () => void }) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const shown = options.filter((option) => option.label.toLowerCase().includes(normalized))
  return (
    <div className="absolute left-0 top-9 z-50 w-[260px] rounded-[10px] border border-[#e6e6e3] bg-white p-1.5 shadow-lg">
      {options.length > 6 && <label className="mb-1.5 flex items-center gap-1.5 rounded-md border border-[#e6e6e3] bg-[#fafaf8] px-2 py-1.5"><Search className="size-3 text-[#9a9a9a]" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${label.toLowerCase()}...`} aria-label={`Buscar ${label.toLowerCase()}`} className="w-full bg-transparent text-[11px] outline-none" /></label>}
      <div role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-[240px] overflow-y-auto overscroll-contain">
        {loading ? <p className="flex items-center gap-2 px-2.5 py-3 text-[11px] text-[#888]"><LoaderCircle className="size-3 animate-spin" />Cargando opciones...</p>
          : error ? <p className="px-2.5 py-3 text-[11px] text-[#b42318]">{error}</p>
          : shown.length === 0 ? <p className="px-2.5 py-3 text-[11px] text-[#9a9a9a]">{options.length ? 'Sin coincidencias' : 'No hay opciones para este cliente en el período.'}</p>
          : shown.map((option) => {
            const checked = selected.includes(option.value)
            return (
              <button type="button" role="option" aria-selected={checked} key={option.value} onClick={() => onToggle(option.value)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] hover:bg-[#f5f5f5]">
                <span className={cn('flex size-3.5 shrink-0 items-center justify-center rounded border', checked ? 'border-[#F97316] bg-[#F97316] text-white' : 'border-[#cfcfcc] bg-white')}>{checked && <Check className="size-2.5" />}</span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.detail && <span className="shrink-0 text-[10px] text-[#9a9a9a]">{option.detail}</span>}
              </button>
            )
          })}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-[#eee] px-2.5 pt-1.5">
        <span className="text-[10px] leading-4 text-[#9a9a9a]">{hint ?? (selected.length ? `${selected.length} seleccionadas` : 'Sin selección: se muestran todas')}</span>
        {selected.length > 0 && <button type="button" onClick={onClear} className="shrink-0 text-[10px] font-medium text-[#c2560c]">Todas</button>}
      </div>
    </div>
  )
}
