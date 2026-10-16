'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export interface ComboboxOption {
  id: string
  label: string
}

interface SearchComboboxProps<T extends ComboboxOption> {
  options: T[]
  value: string | null
  onChange: (id: string) => void
  placeholder: string
  searchPlaceholder: string
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  renderOption: (option: T) => ReactNode
  recentIds?: string[]
}

const MAX_RESULTS = 60

function rankOptions<T extends ComboboxOption>(options: T[], query: string): T[] {
  const q = normalizeSearch(query)
  if (!q) return options.slice(0, MAX_RESULTS)
  const tokens = q.split(/\s+/)
  const scored: { option: T; score: number }[] = []
  for (const option of options) {
    const label = normalizeSearch(option.label)
    if (!tokens.every((t) => label.includes(t))) continue
    const score = label === q ? 0 : label.startsWith(q) ? 1 : label.split(/\s+/).some((w) => w.startsWith(tokens[0])) ? 2 : 3
    scored.push({ option, score })
  }
  scored.sort((a, b) => a.score - b.score || a.option.label.localeCompare(b.option.label))
  return scored.slice(0, MAX_RESULTS).map((s) => s.option)
}

export function SearchCombobox<T extends ComboboxOption>({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = 'Sin resultados',
  disabled,
  invalid,
  className,
  renderOption,
  recentIds = [],
}: SearchComboboxProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => options.find((o) => o.id === value), [options, value])
  const results = useMemo(() => rankOptions(options, query), [options, query])
  const recents = useMemo(() => {
    if (query.trim() || recentIds.length === 0) return []
    const byId = new Map(options.map((o) => [o.id, o]))
    return recentIds.map((id) => byId.get(id)).filter((o): o is T => Boolean(o))
  }, [options, query, recentIds])
  const recentSet = new Set(recents.map((r) => r.id))

  const select = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const item = (option: T) => (
    <CommandItem key={option.id} value={option.id} onSelect={() => select(option.id)} className="gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-2">{renderOption(option)}</span>
      {option.id === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            'flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-destructive ring-1 ring-destructive',
            className,
          )}
        >
          <span className={cn('flex min-w-0 flex-1 items-center gap-2 truncate text-left', !selected && 'text-muted-foreground')}>
            {selected ? renderOption(selected) : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {recents.length > 0 && <CommandGroup heading="Recientes">{recents.map(item)}</CommandGroup>}
            <CommandGroup heading={recents.length > 0 ? 'Todos' : undefined}>
              {results.filter((o) => !recentSet.has(o.id)).map(item)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
