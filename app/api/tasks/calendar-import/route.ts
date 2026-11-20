import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserGoogleCalendarAccessToken } from '@/lib/google-tokens'
import { matchClientByTitle, toCalendarMeeting, type CalendarMeeting, type ClientRef, type GoogleCalendarEvent } from '@/lib/google-calendar/meetings'

const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const LOOKAHEAD_DAYS = 14
const DONE_STATES = new Set(['resuelto', 'completada', 'no_realizado'])

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))

async function fetchUpcomingEvents(accessToken: string) {
  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setHours(0, 0, 0, 0)
  const timeMax = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000)
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(CALENDAR_EVENTS_URL)
    url.searchParams.set('timeMin', timeMin.toISOString())
    url.searchParams.set('timeMax', timeMax.toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return { ok: false as const, status: response.status }
    const body = (await response.json()) as { items?: GoogleCalendarEvent[]; nextPageToken?: string }
    events.push(...(body.items ?? []))
    pageToken = body.nextPageToken
    if (!pageToken) break
  }
  return { ok: true as const, events }
}

/**
 * Trae las reuniones de los próximos días del calendario que conectó el usuario
 * y las crea como tareas suyas. Si una reunión ya se importó, actualiza su
 * horario y links en lugar de duplicarla.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accessToken = await getUserGoogleCalendarAccessToken(user.id)
  if (!accessToken) return NextResponse.json({ error: 'Conectá tu Google Calendar en Conectores para traer tus reuniones.', needsConnection: true }, { status: 409 })

  const result = await fetchUpcomingEvents(accessToken).catch(() => ({ ok: false as const, status: 0 }))
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return NextResponse.json({ error: 'Google Calendar pidió volver a conectar la cuenta.', needsConnection: true }, { status: 409 })
    return NextResponse.json({ error: 'No se pudo leer Google Calendar. Probá de nuevo en un momento.' }, { status: 502 })
  }

  const meetings = result.events.map(toCalendarMeeting).filter((meeting): meeting is CalendarMeeting => Boolean(meeting))
  if (meetings.length === 0) return NextResponse.json({ created: 0, updated: 0, unchanged: 0, total: 0 })

  const existing = new Map<string, { id: string; estado: string; reunion_inicio: string | null; reunion_fin: string | null; google_meet_url: string | null; google_calendar_url: string | null }>()
  for (const ids of chunk(meetings.map((meeting) => meeting.eventId), 100)) {
    const { data, error } = await supabase
      .from('tareas')
      .select('id, estado, google_calendar_event_id, reunion_inicio, reunion_fin, google_meet_url, google_calendar_url')
      .eq('creado_por', user.id)
      .in('google_calendar_event_id', ids)
    if (error) {
      console.error('[calendar-import] No se pudieron leer las tareas existentes:', error.message)
      return NextResponse.json({ error: 'No se pudieron leer tus tareas. Revisá que la base tenga las columnas de reuniones.' }, { status: 500 })
    }
    for (const row of data ?? []) existing.set(row.google_calendar_event_id as string, row)
  }

  const [{ data: clientRows }, { data: meetingType }] = await Promise.all([
    supabase.from('clientes').select('id, nombre_del_negocio').limit(5000),
    supabase.from('tipo_de_tareas').select('id').ilike('nombre', '%reuni%').limit(1).maybeSingle(),
  ])
  const clients = (clientRows ?? []) as ClientRef[]

  const sameInstant = (a: string | null, b: string) => Boolean(a) && new Date(a as string).getTime() === new Date(b).getTime()
  let updated = 0
  let unchanged = 0
  const toInsert: Record<string, unknown>[] = []

  for (const meeting of meetings) {
    const current = existing.get(meeting.eventId)
    if (current) {
      const changed = !sameInstant(current.reunion_inicio, meeting.start) || !sameInstant(current.reunion_fin, meeting.end) || current.google_meet_url !== meeting.meetUrl || current.google_calendar_url !== meeting.calendarUrl
      if (!changed || DONE_STATES.has(current.estado)) {
        unchanged += 1
        continue
      }
      const { error } = await supabase
        .from('tareas')
        .update({ reunion_inicio: meeting.start, reunion_fin: meeting.end, fecha_de_inicio: meeting.start, fecha_vencimiento: meeting.start, google_meet_url: meeting.meetUrl, google_calendar_url: meeting.calendarUrl })
        .eq('id', current.id)
        .eq('creado_por', user.id)
      if (error) console.error('[calendar-import] No se pudo actualizar la tarea:', error.message)
      else updated += 1
      continue
    }
    const client = matchClientByTitle(meeting.title, clients)
    toInsert.push({
      titulo: meeting.title,
      descripcion: null,
      tipo_tarea_id: meetingType?.id ?? null,
      cliente_id: client?.id ?? null,
      cliente_ids: client ? [client.id] : null,
      asignado_a: user.id,
      asignados_a: [user.id],
      creado_por: user.id,
      estado: 'pendiente',
      prioridad: 'media',
      fecha_de_inicio: meeting.start,
      fecha_vencimiento: meeting.start,
      reunion_inicio: meeting.start,
      reunion_fin: meeting.end,
      google_calendar_event_id: meeting.eventId,
      google_calendar_url: meeting.calendarUrl,
      google_meet_url: meeting.meetUrl,
    })
  }

  let created = 0
  for (const rows of chunk(toInsert, 50)) {
    const { error } = await supabase.from('tareas').insert(rows)
    if (!error) {
      created += rows.length
      continue
    }
    // 23505: otra importación en paralelo ya creó alguna; se insertan de a una y se saltean las repetidas.
    if (error.code !== '23505') {
      console.error('[calendar-import] No se pudieron crear las tareas:', error.message)
      return NextResponse.json({ error: 'No se pudieron crear las tareas de las reuniones.', created, updated }, { status: 500 })
    }
    for (const row of rows) {
      const single = await supabase.from('tareas').insert(row)
      if (!single.error) created += 1
      else if (single.error.code === '23505') unchanged += 1
      else console.error('[calendar-import] No se pudo crear la tarea:', single.error.message)
    }
  }

  return NextResponse.json({ created, updated, unchanged, total: meetings.length })
}
