/** Evento tal como lo devuelve la API de Google Calendar (solo los campos que usamos). */
export type GoogleCalendarEvent = {
  id: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  description?: string
  htmlLink?: string
  hangoutLink?: string
  eventType?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string; self?: boolean; responseStatus?: string; resource?: boolean }>
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }
}

export type CalendarMeeting = {
  eventId: string
  title: string
  start: string
  end: string
  calendarUrl: string | null
  meetUrl: string | null
}

export type ClientRef = { id: string; nombre_del_negocio: string | null }

/**
 * Solo las reuniones con horario: deja afuera eventos de todo el día (feriados,
 * cumpleaños, vacaciones), bloques de foco/fuera de oficina y los que la
 * persona rechazó.
 */
export function isImportableMeeting(event: GoogleCalendarEvent) {
  if (event.status === 'cancelled') return false
  if (!event.start?.dateTime || !event.end?.dateTime) return false
  if (event.eventType && event.eventType !== 'default') return false
  const self = event.attendees?.find((attendee) => attendee.self)
  if (self?.responseStatus === 'declined') return false
  return true
}

export function toCalendarMeeting(event: GoogleCalendarEvent): CalendarMeeting | null {
  if (!isImportableMeeting(event)) return null
  const videoLink = event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri
  return {
    eventId: event.id,
    title: event.summary?.trim() || 'Reunión sin título',
    start: new Date(event.start!.dateTime!).toISOString(),
    end: new Date(event.end!.dateTime!).toISOString(),
    calendarUrl: event.htmlLink ?? null,
    meetUrl: event.hangoutLink ?? videoLink ?? null,
  }
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Cliente cuyo nombre aparece completo en el título de la reunión. Si varios
 * coinciden gana el nombre más largo ("Soy Aurelia" antes que "Aurelia");
 * los nombres muy cortos no se usan porque darían falsos positivos.
 */
export function matchClientByTitle(title: string, clients: ClientRef[]): ClientRef | null {
  const haystack = ` ${normalize(title)} `
  let best: { client: ClientRef; length: number } | null = null
  for (const client of clients) {
    const name = normalize(client.nombre_del_negocio ?? '')
    if (name.length < 4) continue
    if (haystack.includes(` ${name} `) && (!best || name.length > best.length)) best = { client, length: name.length }
  }
  return best?.client ?? null
}
