import { describe, expect, it } from 'vitest'
import { entrySeconds, formatClock, formatDuration, secondsByClient, type AureliaTimeEntry } from './time-shared'

const entry = (overrides: Partial<AureliaTimeEntry>): AureliaTimeEntry => ({
  id: 'x', colaboradorId: 'u', colaboradorName: 'Ana', clientId: 'c1', clientName: 'Cliente', descripcion: null,
  fecha: '2026-11-10', iniciadoEn: '2026-11-10T12:00:00Z', finalizadoEn: '2026-11-10T13:30:00Z', duracionSeg: 5400, ...overrides,
})

describe('Aurelia time helpers', () => {
  it('counts running entries up to now', () => {
    expect(entrySeconds(entry({ finalizadoEn: null, duracionSeg: null }), new Date('2026-11-10T12:10:00Z').getTime())).toBe(600)
  })

  it('totals seconds per client within the date range', () => {
    const totals = secondsByClient([
      entry({ id: '1' }),
      entry({ id: '2', clientId: 'c2', duracionSeg: 600 }),
      entry({ id: '3', fecha: '2026-10-31', duracionSeg: 999 }),
    ], '2026-11-01', '2026-11-30')
    expect(totals.get('c1')).toBe(5400)
    expect(totals.get('c2')).toBe(600)
  })

  it('formats durations', () => {
    expect(formatDuration(5400)).toBe('1 h 30 min')
    expect(formatDuration(600)).toBe('10 min')
    expect(formatClock(3725)).toBe('01:02:05')
  })
})
