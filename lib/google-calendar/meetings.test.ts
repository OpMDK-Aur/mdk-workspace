import { describe, expect, it } from 'vitest'
import { isImportableMeeting, matchClientByTitle, toCalendarMeeting, type GoogleCalendarEvent } from './meetings'

const base: GoogleCalendarEvent = {
  id: 'evt1',
  status: 'confirmed',
  summary: 'Revisión mensual Soy Aurelia',
  start: { dateTime: '2026-11-21T15:00:00-03:00' },
  end: { dateTime: '2026-11-21T15:30:00-03:00' },
  htmlLink: 'https://calendar.google.com/event?eid=1',
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
}

describe('reuniones de Google Calendar', () => {
  it('convierte un evento con horario y link de Meet', () => {
    expect(toCalendarMeeting(base)).toEqual({
      eventId: 'evt1',
      title: 'Revisión mensual Soy Aurelia',
      start: '2026-11-21T18:00:00.000Z',
      end: '2026-11-21T18:30:00.000Z',
      calendarUrl: 'https://calendar.google.com/event?eid=1',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    })
  })

  it('usa el link de videollamada de conferenceData si no hay hangoutLink', () => {
    const meeting = toCalendarMeeting({ ...base, hangoutLink: undefined, conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'video', uri: 'https://zoom.us/j/1' }] } })
    expect(meeting?.meetUrl).toBe('https://zoom.us/j/1')
  })

  it('descarta eventos de todo el día, cancelados, rechazados y bloques que no son reuniones', () => {
    expect(isImportableMeeting({ ...base, start: { date: '2026-11-21' }, end: { date: '2026-11-22' } })).toBe(false)
    expect(isImportableMeeting({ ...base, status: 'cancelled' })).toBe(false)
    expect(isImportableMeeting({ ...base, attendees: [{ email: 'yo@mdk.io', self: true, responseStatus: 'declined' }] })).toBe(false)
    expect(isImportableMeeting({ ...base, eventType: 'focusTime' })).toBe(false)
    expect(isImportableMeeting({ ...base, eventType: 'outOfOffice' })).toBe(false)
    expect(isImportableMeeting(base)).toBe(true)
  })

  it('asocia el cliente por nombre completo, prefiriendo el más largo', () => {
    const clients = [{ id: 'a', nombre_del_negocio: 'Aurelia' }, { id: 'b', nombre_del_negocio: 'Soy Aurelia' }, { id: 'c', nombre_del_negocio: 'ICS' }]
    expect(matchClientByTitle('Revisión mensual Soy Aurelia', clients)?.id).toBe('b')
    expect(matchClientByTitle('Kickoff aurelia!', clients)?.id).toBe('a')
    expect(matchClientByTitle('Reunión ICS Salud', clients)).toBeNull()
    expect(matchClientByTitle('Aurelianos', clients)).toBeNull()
  })

  it('ignora acentos y mayúsculas al comparar', () => {
    expect(matchClientByTitle('CAMPAÑA PIRE RAYEN', [{ id: 'x', nombre_del_negocio: 'Piré Rayen' }])?.id).toBe('x')
  })
})
