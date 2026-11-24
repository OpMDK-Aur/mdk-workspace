import type { DevCategory, DevStage, DevTask } from './followup-shared'

/** Cliente elegido en el filtro (mismo formato que el selector de clientes). */
export type FilterClient = { id: string; name: string } | null

export type Range = { from: string; to: string }

export type DevFilters = {
  pedido: Range
  fin: Range
  prioridad: 'all' | 'si' | 'no'
  categoria: 'all' | DevCategory
  etapas: DevStage[]
  client: FilterClient
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

