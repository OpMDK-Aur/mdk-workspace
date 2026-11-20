import { describe, expect, it } from 'vitest'
import { firstName, formatWorked, groupAlerts, phraseOfTheDay, todayRange, type InicioAlert } from './inicio'

const alert = (subtipo: string, desde: string | null, id = subtipo): InicioAlert => ({ id, clienteId: 'c', clienteNombre: 'Cliente', subtipo, plataforma: 'meta', desde, mensaje: null })

describe('Inicio de Conexa', () => {
  it('calcula el día de hoy en Argentina aunque en UTC ya sea mañana', () => {
    const range = todayRange(new Date('2026-11-21T02:30:00Z'))
    expect(range.day).toBe('2026-11-20')
    expect(range.start).toBe('2026-11-20T03:00:00.000Z')
    expect(range.end).toBe('2026-11-21T03:00:00.000Z')
  })

  it('agrupa alertas en orden de revisión y pone primero las recién activadas', () => {
    const now = new Date('2026-11-20T15:00:00Z').getTime()
    const groups = groupAlerts([
      alert('cpl_supera_objetivo', '2026-11-01T00:00:00Z'),
      alert('cero_impresiones', '2026-11-10T00:00:00Z', 'vieja'),
      alert('cero_impresiones', '2026-11-20T10:00:00Z', 'nueva'),
      alert('algo_nuevo', null),
    ], now)
    expect(groups.map((group) => group.id)).toEqual(['impresiones', 'cpl', 'otras'])
    expect(groups[0].alerts.map((item) => item.id)).toEqual(['nueva', 'vieja'])
  })

  it('formatea horas trabajadas y nombres', () => {
    expect(formatWorked(0)).toBe('0 min')
    expect(formatWorked(45 * 60)).toBe('45 min')
    expect(formatWorked(3 * 3600 + 20 * 60)).toBe('3 h 20 min')
    expect(formatWorked(2 * 3600)).toBe('2 h')
    expect(firstName('Erika Gordillo')).toBe('Erika')
  })

  it('elige la misma frase todo el día', () => {
    expect(phraseOfTheDay('2026-11-20', 'u1')).toBe(phraseOfTheDay('2026-11-20', 'u1'))
  })
})
