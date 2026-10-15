'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, ListFilter, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ASSIGNEES,
  DUE_FILTER_LABELS,
  PRIORITY_CONFIG,
  STATUS_CONFIG,
  STATUS_ORDER,
  TYPE_CONFIG,
  useTaskStore,
  type DueFilter,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks/task-store'

type Filters = ReturnType<typeof useTaskStore.getState>['filters']

const PRIORITIES: TaskPriority[] = ['alta', 'media', 'baja']
const DUE_OPTIONS: DueFilter[] = ['today', 'week', 'overdue', 'next7', 'none', 'range']
const UNASSIGNED = '__none__'

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? []
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
}

export function countActiveFilters(f: Filters): number {
  let n = 0
  if ((f.statusIds?.length ?? 0) > 0) n++
  if ((f.priorities?.length ?? 0) > 0) n++
  if ((f.types?.length ?? 0) > 0) n++
  if (f.assigneeIds.length > 0 || f.showUnassigned) n++
  if ((f.creatorIds?.length ?? 0) > 0) n++
  if (f.dueFilter) n++
  return n
}

function Section({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? count > 0)
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && (
            <span className="rounded-full bg-[#FF7F00]/15 px-1.5 text-xs font-semibold text-[#FF7F00]">{count}</span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="flex flex-col gap-0.5 px-2 pb-3">{children}</div>}
    </div>
  )
}

function Option({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-[#FF7F00] bg-[#FF7F00] text-[#141414]' : 'border-border',
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

function PeopleList({
  selected,
  onToggle,
  withUnassigned,
  unassignedChecked,
}: {
  selected: string[]
  onToggle: (id: string) => void
  withUnassigned?: boolean
  unassignedChecked?: boolean
}) {
  const [q, setQ] = useState('')
  const people = useMemo(
    () => ASSIGNEES.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, ASSIGNEES.length],
  )
  return (
    <>
      <div className="relative mb-1 px-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar persona…"
          aria-label="Buscar persona"
          className="h-8 w-full rounded-md border border-border bg-transparent pl-7 pr-2 text-sm outline-none focus:border-[#FF7F00]"
        />
      </div>
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {withUnassigned && !q && (
          <Option checked={!!unassignedChecked} onClick={() => onToggle(UNASSIGNED)}>
            <span className="text-muted-foreground">Sin asignar</span>
          </Option>
        )}
        {people.map((p) => (
          <Option key={p.id} checked={selected.includes(p.id)} onClick={() => onToggle(p.id)}>
            <span className="flex items-center gap-2">
              {p.avatar_url ? (
                <img src={p.avatar_url || '/placeholder.svg'} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  {p.name.charAt(0).toUpperCase()}
                </span>
              )}
              {p.name}
            </span>
          </Option>
        ))}
        {people.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados</p>}
      </div>
    </>
  )
}

export function FiltersPopover() {
  const filters = useTaskStore((s) => s.filters)
  const setFilter = useTaskStore((s) => s.setFilter)
  const count = countActiveFilters(filters)

  const clearPanel = () => {
    setFilter('statusIds', [])
    setFilter('priorities', [])
    setFilter('types', [])
    setFilter('assigneeIds', [])
    setFilter('showUnassigned', false)
    setFilter('creatorIds', [])
    setFilter('dueFilter', null)
    setFilter('dueFrom', null)
    setFilter('dueTo', null)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-[30px] shrink-0 gap-1.5 rounded-lg border-[var(--tasks-border)] bg-[var(--tasks-card)] text-[12.5px] font-semibold text-[var(--tasks-text)] hover:border-[var(--tasks-border-hover)]', count > 0 && 'border-[var(--tasks-brand)]/50')}
        >
          <ListFilter className="h-4 w-4" />
          Filtros
          {count > 0 && (
            <span className="rounded-full bg-[#FF7F00] px-1.5 text-xs font-semibold text-[#141414]">{count}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <div className="flex max-h-[min(70vh,560px)] flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Filtros</p>
            {count > 0 && (
              <button
                type="button"
                onClick={clearPanel}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Limpiar todo
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <Section title="Estado" count={filters.statusIds?.length ?? 0} defaultOpen>
              {STATUS_ORDER.map((s) => (
                <Option
                  key={s}
                  checked={filters.statusIds?.includes(s) ?? false}
                  onClick={() => setFilter('statusIds', toggle<TaskStatus>(filters.statusIds, s))}
                >
                  {STATUS_CONFIG[s].label}
                </Option>
              ))}
            </Section>
            <Section title="Prioridad" count={filters.priorities?.length ?? 0}>
              {PRIORITIES.map((p) => (
                <Option
                  key={p}
                  checked={filters.priorities?.includes(p) ?? false}
                  onClick={() => setFilter('priorities', toggle(filters.priorities, p))}
                >
                  {PRIORITY_CONFIG[p].label}
                </Option>
              ))}
            </Section>
            <Section title="Tipo" count={filters.types?.length ?? 0}>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <Option
                  key={key}
                  checked={filters.types?.includes(key) ?? false}
                  onClick={() => setFilter('types', toggle(filters.types, key))}
                >
                  {cfg.label}
                </Option>
              ))}
            </Section>
            <Section title="Responsables" count={filters.assigneeIds.length + (filters.showUnassigned ? 1 : 0)}>
              <PeopleList
                selected={filters.assigneeIds}
                withUnassigned
                unassignedChecked={filters.showUnassigned}
                onToggle={(id) => {
                  if (id === UNASSIGNED) {
                    const next = !filters.showUnassigned
                    setFilter('showUnassigned', next)
                    if (next) setFilter('assigneeIds', [])
                    return
                  }
                  setFilter('showUnassigned', false)
                  setFilter('assigneeIds', toggle(filters.assigneeIds, id))
                }}
              />
            </Section>
            <Section title="Creado por" count={filters.creatorIds?.length ?? 0}>
              <PeopleList
                selected={filters.creatorIds ?? []}
                onToggle={(id) => setFilter('creatorIds', toggle(filters.creatorIds, id))}
              />
            </Section>
            <Section title="Vencimiento" count={filters.dueFilter ? 1 : 0}>
              {DUE_OPTIONS.map((d) => (
                <Option
                  key={d}
                  checked={filters.dueFilter === d}
                  onClick={() => setFilter('dueFilter', filters.dueFilter === d ? null : d)}
                >
                  {DUE_FILTER_LABELS[d]}
                </Option>
              ))}
              {filters.dueFilter === 'range' && (
                <div className="mt-1 flex items-center gap-2 px-2">
                  <input
                    type="date"
                    aria-label="Vence desde"
                    value={filters.dueFrom ?? ''}
                    onChange={(e) => setFilter('dueFrom', e.target.value || null)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-sm outline-none focus:border-[#FF7F00]"
                  />
                  <span className="text-muted-foreground">{'–'}</span>
                  <input
                    type="date"
                    aria-label="Vence hasta"
                    value={filters.dueTo ?? ''}
                    onChange={(e) => setFilter('dueTo', e.target.value || null)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-sm outline-none focus:border-[#FF7F00]"
                  />
                </div>
              )}
            </Section>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface Chip {
  key: string
  label: string
  onRemove: () => void
}

export function ActiveFilterChips() {
  const filters = useTaskStore((s) => s.filters)
  const setFilter = useTaskStore((s) => s.setFilter)
  const clearFilters = useTaskStore((s) => s.clearFilters)
  const tasks = useTaskStore((s) => s.tasks)
  const clients = useMemo(() => {
    if (!filters.clientIds?.length) return []
    const map = new Map<string, string>()
    for (const t of tasks) for (const c of t.clients ?? []) if (c?.id && !map.has(c.id)) map.set(c.id, c.name)
    return [...map].map(([id, name]) => ({ id, name }))
  }, [tasks, filters.clientIds])

  const nameOf = (id: string) => ASSIGNEES.find((a) => a.id === id)?.name ?? 'Usuario'
  const chips: Chip[] = []

  filters.statusIds?.forEach((s) =>
    chips.push({ key: `st-${s}`, label: STATUS_CONFIG[s]?.label ?? s, onRemove: () => setFilter('statusIds', filters.statusIds.filter((x) => x !== s)) }),
  )
  filters.priorities?.forEach((p) =>
    chips.push({ key: `pr-${p}`, label: `Prioridad ${PRIORITY_CONFIG[p].label.toLowerCase()}`, onRemove: () => setFilter('priorities', filters.priorities!.filter((x) => x !== p)) }),
  )
  filters.types?.forEach((t) =>
    chips.push({ key: `ty-${t}`, label: TYPE_CONFIG[t]?.label ?? t, onRemove: () => setFilter('types', filters.types!.filter((x) => x !== t)) }),
  )
  if (filters.showUnassigned) chips.push({ key: 'unassigned', label: 'Sin asignar', onRemove: () => setFilter('showUnassigned', false) })
  filters.assigneeIds.forEach((id) =>
    chips.push({ key: `as-${id}`, label: nameOf(id), onRemove: () => setFilter('assigneeIds', filters.assigneeIds.filter((x) => x !== id)) }),
  )
  filters.creatorIds?.forEach((id) =>
    chips.push({ key: `cr-${id}`, label: `Creada por ${nameOf(id)}`, onRemove: () => setFilter('creatorIds', filters.creatorIds!.filter((x) => x !== id)) }),
  )
  if (filters.dueFilter) {
    const label =
      filters.dueFilter === 'range'
        ? `Vence ${filters.dueFrom ?? '…'} – ${filters.dueTo ?? '…'}`
        : DUE_FILTER_LABELS[filters.dueFilter]
    chips.push({ key: 'due', label, onRemove: () => { setFilter('dueFilter', null); setFilter('dueFrom', null); setFilter('dueTo', null) } })
  }
  filters.clientIds?.forEach((id) =>
    chips.push({
      key: `cl-${id}`,
      label: clients?.find((c) => c.id === id)?.name ?? 'Cliente',
      onRemove: () => setFilter('clientIds', filters.clientIds.filter((x) => x !== id)),
    }),
  )
  if (filters.createdFrom || filters.createdTo) {
    chips.push({
      key: 'created',
      label: `Creada ${filters.createdFrom ?? '…'} – ${filters.createdTo ?? '…'}`,
      onRemove: () => { setFilter('createdFrom', null); setFilter('createdTo', null) },
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/40 pl-3 pr-1 text-xs font-medium text-foreground"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Quitar filtro ${c.label}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clearFilters}
        className="ml-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Limpiar todo
      </button>
    </div>
  )
}

const LIST_PARAMS = {
  estado: 'statusIds',
  prioridad: 'priorities',
  tipo: 'types',
  resp: 'assigneeIds',
  creador: 'creatorIds',
  cliente: 'clientIds',
} as const
const SCALAR_PARAMS = {
  vence: 'dueFilter',
  vdesde: 'dueFrom',
  vhasta: 'dueTo',
  cdesde: 'createdFrom',
  chasta: 'createdTo',
} as const

function filtersToParams(f: Filters, base: URLSearchParams) {
  const p = new URLSearchParams(base.toString())
  for (const [param, key] of Object.entries(LIST_PARAMS)) {
    const v = (f[key as keyof Filters] as string[] | undefined) ?? []
    if (v.length > 0) p.set(param, v.join(','))
    else p.delete(param)
  }
  for (const [param, key] of Object.entries(SCALAR_PARAMS)) {
    const v = f[key as keyof Filters] as string | null | undefined
    if (v) p.set(param, v)
    else p.delete(param)
  }
  if (f.showUnassigned) p.set('sinasignar', '1')
  else p.delete('sinasignar')
  return p
}

/** Keeps the task filters in the URL so a filtered view can be shared or bookmarked. */
export function useFiltersUrlSync(enabled: boolean) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filters = useTaskStore((s) => s.filters)
  const setFilter = useTaskStore((s) => s.setFilter)
  const appliedFromUrl = useRef(false)

  useEffect(() => {
    if (!enabled || appliedFromUrl.current) return
    appliedFromUrl.current = true
    const hasAny =
      Object.keys(LIST_PARAMS).some((k) => searchParams.has(k)) ||
      Object.keys(SCALAR_PARAMS).some((k) => searchParams.has(k)) ||
      searchParams.has('sinasignar')
    if (!hasAny) return
    for (const [param, key] of Object.entries(LIST_PARAMS)) {
      const raw = searchParams.get(param)
      setFilter(key as keyof Filters, raw ? raw.split(',').filter(Boolean) : [])
    }
    for (const [param, key] of Object.entries(SCALAR_PARAMS)) {
      setFilter(key as keyof Filters, searchParams.get(param) || null)
    }
    setFilter('showUnassigned', searchParams.get('sinasignar') === '1')
  }, [enabled, searchParams, setFilter])

  useEffect(() => {
    if (!enabled || !appliedFromUrl.current) return
    const next = filtersToParams(filters, new URLSearchParams(window.location.search))
    const nextStr = next.toString()
    if (nextStr === window.location.search.replace(/^\?/, '')) return
    router.replace(nextStr ? `${pathname}?${nextStr}` : pathname, { scroll: false })
  }, [enabled, filters, pathname, router])
}
