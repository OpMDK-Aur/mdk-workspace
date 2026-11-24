'use client'

import { Flag, ListFilter, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DEV_CATEGORIES, DEV_STAGES, type DevCategory, type DevStage, type DevTask } from '@/lib/aurelia/followup-shared'
import { ClientPicker, type PickedClient } from './client-picker'

type Range = { from: string; to: string }

export type DevFilters = {
  pedido: Range
  fin: Range
  prioridad: 'all' | 'si' | 'no'
  categoria: 'all' | DevCategory
  etapas: DevStage[]
  client: PickedClient
}

export const EMPTY_FILTERS: DevFilters = {
  pedido: { from: '', to: '' },
  fin: { from: '', to: '' },
  prioridad: 'all',
  categoria: 'all',
  etapas: [],
  client: null,
}

const inRange = (value: string | null, range: Range) =>
  (!range.from && !range.to) || (value !== null && (!range.from || value >= range.from) && (!range.to || value <= range.to))

export function matchesFilters(task: DevTask, filters: DevFilters) {
  return inRange(task.fechaPedido, filters.pedido)
    && inRange(task.fechaFin, filters.fin)
    && (filters.prioridad === 'all' || task.prioridad === (filters.prioridad === 'si'))
    && (filters.categoria === 'all' || task.categoria === filters.categoria)
    && (filters.etapas.length === 0 || filters.etapas.includes(task.etapa))
    && (!filters.client || task.clientId === filters.client.id)
}

export function countActiveFilters(filters: DevFilters) {
  return [
    filters.pedido.from || filters.pedido.to,
    filters.fin.from || filters.fin.to,
    filters.prioridad !== 'all',
    filters.categoria !== 'all',
    filters.etapas.length > 0,
    filters.client,
  ].filter(Boolean).length
}

export function DevBoardFilters({ filters, onChange }: { filters: DevFilters; onChange: (filters: DevFilters) => void }) {
  const active = countActiveFilters(filters)
  const set = <K extends keyof DevFilters>(key: K, value: DevFilters[K]) => onChange({ ...filters, [key]: value })

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-1.5">
            <ListFilter className="size-4" aria-hidden="true" />
            Filtros
            {active > 0 && <Badge className="h-5 min-w-5 px-1.5 text-[11px]">{active}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-[22rem] flex-col gap-4">
          <RangeField id="filtro-pedido" label="Fecha de pedido" range={filters.pedido} onChange={(range) => set('pedido', range)} />
          <RangeField id="filtro-fin" label="Fecha de fin" range={filters.fin} onChange={(range) => set('fin', range)} />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Prioridad</legend>
            <ToggleGroup type="single" variant="outline" size="sm" value={filters.prioridad} onValueChange={(value) => value && set('prioridad', value as DevFilters['prioridad'])} className="w-full">
              <ToggleGroupItem value="all" className="flex-1">Todas</ToggleGroupItem>
              <ToggleGroupItem value="si" className="flex-1 gap-1"><Flag className="size-3 fill-destructive text-destructive" aria-hidden="true" />Prioritarias</ToggleGroupItem>
              <ToggleGroupItem value="no" className="flex-1">Sin prioridad</ToggleGroupItem>
            </ToggleGroup>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Categoría</legend>
            <ToggleGroup type="single" variant="outline" size="sm" value={filters.categoria} onValueChange={(value) => value && set('categoria', value as DevFilters['categoria'])} className="w-full">
              <ToggleGroupItem value="all" className="flex-1">Todas</ToggleGroupItem>
              {DEV_CATEGORIES.map((category) => <ToggleGroupItem key={category.id} value={category.id} className="flex-1">{category.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Etapa</legend>
            <div className="grid grid-cols-2 gap-2">
              {DEV_STAGES.map((stage) => {
                const checked = filters.etapas.includes(stage.id)
                return (
                  <Label key={stage.id} className="flex cursor-pointer items-center gap-2 font-normal">
                    <Checkbox checked={checked} onCheckedChange={(next) => set('etapas', next ? [...filters.etapas, stage.id] : filters.etapas.filter((id) => id !== stage.id))} />
                    {stage.label}
                  </Label>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-cliente">Cliente</Label>
            <ClientPicker id="filtro-cliente" value={filters.client} onChange={(client) => set('client', client)} />
          </div>

          <Button variant="ghost" size="sm" className="self-end" disabled={active === 0} onClick={() => onChange(EMPTY_FILTERS)}>Limpiar filtros</Button>
        </PopoverContent>
      </Popover>
      {active > 0 && (
        <Button variant="ghost" size="icon" onClick={() => onChange(EMPTY_FILTERS)} aria-label="Limpiar filtros">
          <X className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

function RangeField({ id, label, range, onChange }: { id: string; label: string; range: Range; onChange: (range: Range) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-2">
        <Input id={`${id}-desde`} type="date" value={range.from} max={range.to || undefined} onChange={(event) => onChange({ ...range, from: event.target.value })} aria-label={`${label} desde`} />
        <span className="text-xs text-muted-foreground">a</span>
        <Input id={`${id}-hasta`} type="date" value={range.to} min={range.from || undefined} onChange={(event) => onChange({ ...range, to: event.target.value })} aria-label={`${label} hasta`} />
      </div>
    </fieldset>
  )
}
