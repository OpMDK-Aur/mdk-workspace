-- Vincula tareas con eventos de Google Calendar (reuniones importadas o agendadas desde MDK).
-- Solo agrega columnas que aceptan NULL (sin reescribir la tabla) y un índice parcial.
set statement_timeout = '15s';
set lock_timeout = '5s';

alter table public.tareas
  add column if not exists google_calendar_event_id text,
  add column if not exists google_calendar_url text,
  add column if not exists google_meet_url text,
  add column if not exists reunion_inicio timestamptz,
  add column if not exists reunion_fin timestamptz;

-- Evita importar dos veces el mismo evento para la misma persona.
-- Parcial: solo indexa las filas que son reuniones de calendario.
create unique index if not exists tareas_creador_evento_calendar_key
  on public.tareas (creado_por, google_calendar_event_id)
  where google_calendar_event_id is not null;
