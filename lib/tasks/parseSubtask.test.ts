import { describe, expect, it } from 'vitest'
import { parseSubtask, toISODate, trailingMention } from './parse-subtask'

const team = [
  { id: 'u1', name: 'Joshua Herrera' },
  { id: 'u2', name: 'Florencia Bassola' },
  { id: 'u3', name: 'Erika Gómez' },
]

// Miércoles 15/10/2026
const today = new Date(2026, 9, 15)

describe('parseSubtask', () => {
  it('detecta responsable y día de la semana', () => {
    const r = parseSubtask('Confirmar dominio @Joshua viernes', team, today)
    expect(r.title).toBe('Confirmar dominio')
    expect(r.assignee?.id).toBe('u1')
    expect(toISODate(r.due!)).toBe('2026-10-16')
  })

  it('detecta "para el lunes"', () => {
    const r = parseSubtask('Revisar copy para el lunes', team, today)
    expect(r.title).toBe('Revisar copy')
    expect(r.assignee).toBeNull()
    expect(toISODate(r.due!)).toBe('2026-10-19')
  })

  it('detecta fecha dd/mm y mención en minúsculas', () => {
    const r = parseSubtask('Subir piezas 20/10 @flor', team, today)
    expect(r.title).toBe('Subir piezas')
    expect(r.assignee?.id).toBe('u2')
    expect(toISODate(r.due!)).toBe('2026-10-20')
  })

  it('texto plano sin responsable ni vencimiento', () => {
    const r = parseSubtask('Llamar al cliente', team, today)
    expect(r.title).toBe('Llamar al cliente')
    expect(r.assignee).toBeNull()
    expect(r.due).toBeNull()
  })

  it('expone la búsqueda de mención en curso', () => {
    expect(parseSubtask('Revisar @zz', team, today).mentionQuery).toBe('zz')
    expect(parseSubtask('Revisar @', team, today).mentionQuery).toBe('')
    expect(trailingMention('Revisar @jo')).toBe('jo')
    expect(trailingMention('Revisar @Joshua viernes')).toBeNull()
  })
})
