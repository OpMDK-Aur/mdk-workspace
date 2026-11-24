import { describe, expect, it } from 'vitest'
import { checkSummary, PHRASES, phraseAt, connectionsOf, missingConnections, sortConnections, firstName, formatWorked, groupAlerts, phraseOfTheDay, todayRange, type InicioAlert } from './inicio'

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
    expect(phraseAt(PHRASES.length + 1)).toBe(PHRASES[1])
    expect(PHRASES.every((phrase) => /\p{Extended_Pictographic}/u.test(phrase))).toBe(true)
  })

  it('detecta qué cuentas publicitarias le faltan conectar a cada cliente', () => {
    const metaOnly = connectionsOf({ meta_ads_account_ids: ['1'], cuentas_publicitarias: [{ plataforma: 'google', activo: false }] })
    expect(metaOnly).toEqual({ meta: true, google: false, analytics: false, tag_manager: false })
    expect(connectionsOf({ cuentas_publicitarias: [{ plataforma: 'google', activo: true }] }).google).toBe(true)
    const rows = sortConnections([
      { clienteId: 'a', clienteNombre: 'Completo', conectadas: { meta: true, google: true, analytics: false, tag_manager: false } },
      { clienteId: 'b', clienteNombre: 'Nada', conectadas: { meta: false, google: false, analytics: true, tag_manager: true } },
    ])
    expect(rows.map((row) => row.clienteId)).toEqual(['b', 'a'])
    expect(missingConnections(rows[1])).toEqual([])
  })
})

describe('checkSummary', () => {
  const base = { evaluadas: 0, nuevas_disparadas: 0, re_notificadas: 0, resueltas: 0, omitidas: 0, pendientes: 0, errores: [] }
  it('avisa cuando no hay alertas configuradas', () => {
    expect(checkSummary(base)).toMatch(/no tienen alertas/)
  })
  it('resume nuevas, resueltas y pendientes', () => {
    expect(checkSummary({ ...base, evaluadas: 5, nuevas_disparadas: 2, resueltas: 1, pendientes: 3 })).toBe('Revisamos 5 alertas · 2 nuevas · 1 resuelta. Quedaron 3 sin revisar por tiempo; volvé a tocar el botón.')
  })
  it('marca sin cambios', () => {
    expect(checkSummary({ ...base, evaluadas: 1 })).toBe('Revisamos 1 alerta · sin cambios.')
  })
})
