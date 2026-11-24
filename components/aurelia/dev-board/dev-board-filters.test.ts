import { describe, expect, it } from 'vitest'
import type { DevTask } from '@/lib/aurelia/followup-shared'
import { EMPTY_FILTERS, countActiveFilters, matchesFilters } from './dev-board-filters'

const task: DevTask = {
  id: '1', titulo: 'Arreglar login', descripcion: null, etapa: 'testing', categoria: 'error',
  fechaPedido: '2026-11-10', fechaFin: '2026-11-20', asignadoId: null, asignadoName: null,
  creadoPorId: null, creadoPorName: null, clientId: 'c1', clientName: 'Cliente', prioridad: true, posicion: 0, updatedAt: '',
}

describe('matchesFilters', () => {
  it('passes with no filters', () => {
    expect(matchesFilters(task, EMPTY_FILTERS)).toBe(true)
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0)
  })

  it('filters by date ranges, inclusive', () => {
    expect(matchesFilters(task, { ...EMPTY_FILTERS, pedido: { from: '2026-11-10', to: '2026-11-10' } })).toBe(true)
    expect(matchesFilters(task, { ...EMPTY_FILTERS, pedido: { from: '2026-11-11', to: '' } })).toBe(false)
    expect(matchesFilters({ ...task, fechaFin: null }, { ...EMPTY_FILTERS, fin: { from: '', to: '2026-12-01' } })).toBe(false)
  })

  it('filters by priority, category, stage and client', () => {
    expect(matchesFilters(task, { ...EMPTY_FILTERS, prioridad: 'no' })).toBe(false)
    expect(matchesFilters(task, { ...EMPTY_FILTERS, categoria: 'sugerencia' })).toBe(false)
    expect(matchesFilters(task, { ...EMPTY_FILTERS, etapas: ['backlog', 'testing'] })).toBe(true)
    expect(matchesFilters(task, { ...EMPTY_FILTERS, client: { id: 'c2', name: 'Otro' } })).toBe(false)
    expect(countActiveFilters({ ...EMPTY_FILTERS, prioridad: 'si', etapas: ['testing'] })).toBe(2)
  })
})
