'use client'

import { useState } from 'react'
import { format, parseISO, startOfMonth, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { CalendarPlus, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTaskStore } from '@/lib/tasks/task-store'

const toKey = (d: Date) => format(d, 'yyyy-MM-dd')

const PRESETS: { label: string; range: () => { from: Date; to: Date } }[] = [
  { label: 'Hoy', range: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Últimos 7 días', range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: 'Últimos 30 días', range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: 'Este mes', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
]

function formatLabel(from: string | null, to: string | null) {
  const fmt = (s: string) => format(parseISO(s), 'd MMM', { locale: es })
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`
  if (from) return `Desde ${fmt(from)}`
  if (to) return `Hasta ${fmt(to)}`
  return 'Creación'
}

export function CreatedDateFilter() {
  const createdFrom = useTaskStore((s) => s.filters.createdFrom ?? null)
  const createdTo = useTaskStore((s) => s.filters.createdTo ?? null)
  const setFilter = useTaskStore((s) => s.setFilter)
  const [open, setOpen] = useState(false)

  const active = Boolean(createdFrom || createdTo)
  const selected: DateRange | undefined = active
    ? {
        from: createdFrom ? parseISO(createdFrom) : undefined,
        to: createdTo ? parseISO(createdTo) : undefined,
      }
    : undefined

  const apply = (from: Date | undefined, to: Date | undefined) => {
    setFilter('createdFrom', from ? toKey(from) : null)
    setFilter('createdTo', to ? toKey(to) : from ? toKey(from) : null)
  }

  const clear = () => {
    setFilter('createdFrom', null)
    setFilter('createdTo', null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-[30px] gap-1.5 px-2.5 shrink-0 rounded-lg border-[var(--tasks-border)] bg-[var(--tasks-card)] text-[12.5px] font-semibold text-[var(--tasks-text)] hover:border-[var(--tasks-border-hover)]',
            active && 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/15 hover:text-amber-400'
          )}
          aria-label="Filtrar por fecha de creación"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          {formatLabel(createdFrom, createdTo)}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row flex-wrap gap-1 border-b p-2 sm:flex-col sm:border-b-0 sm:border-r">
            <span className="hidden px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground sm:block">
              Fecha de creación
            </span>
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className="h-8 justify-start text-xs"
                onClick={() => {
                  const { from, to } = p.range()
                  apply(from, to)
                  setOpen(false)
                }}
              >
                {p.label}
              </Button>
            ))}
            {active && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 justify-start text-xs text-muted-foreground"
                onClick={() => {
                  clear()
                  setOpen(false)
                }}
              >
                Limpiar
              </Button>
            )}
          </div>
          <Calendar
            mode="range"
            locale={es}
            numberOfMonths={1}
            selected={selected}
            defaultMonth={selected?.from}
            disabled={{ after: new Date() }}
            onSelect={(range) => {
              if (!range?.from) return clear()
              apply(range.from, range.to)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
